import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cr from "aws-cdk-lib/custom-resources";

import { makeStaticAssetsRoutingTable } from "./utils.mjs";

/**
 * React Server AWS Stack providing:
 * - S3 bucket with static site assets (deployed from staticDir)
 * - CloudFront distribution with behaviors per top-level static folder
 * - Dynamic origin that is either API Gateway v2 (buffered) or Lambda Function URL (streaming)
 */
export class ReactServerAwsStack extends Stack {
  /**
   * @param {cdk.App | cdk.Stack} scope
   * @param {string} id
   * @param {import('aws-cdk-lib').StackProps} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const {
      outDir,
      adapterConfig,
      lambdaEnv = {},
      lambdaConfig = {},
      maxBehaviors = 10,
    } = props;

    const staticDir = join(outDir, "static");
    const functionDir = join(outDir, "functions/index.func");

    // 1) S3 bucket for static content
    const staticBucket = new s3.Bucket(this, "StaticAssets", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      autoDeleteObjects: false,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // 2) Lambda function WITHOUT ORIGIN env var initially
    const fn = new lambda.Function(this, "ServerFunction", {
      runtime: lambdaConfig?.runtime ?? lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      architecture: lambdaConfig?.architecture ?? lambda.Architecture.ARM_64,
      memorySize: lambdaConfig?.memorySize ?? 1024,
      timeout:
        lambdaConfig?.timeout ??
        Duration.seconds(adapterConfig.streaming === true ? 30 : 15),
      code: lambda.Code.fromAsset(functionDir),
      environment: {
        NODE_ENV: "production",
        DEBUG: lambdaEnv.DEBUG ?? "react-server-adapter",
        // DO NOT set ORIGIN here - will cause circular dependency
        ...lambdaEnv,
      },
    });

    // 3) Create the dynamic origin based on streaming flag
    let dynamicOrigin;
    let fnUrl = null;

    if (adapterConfig.streaming) {
      // Lambda Function URL with RESPONSE_STREAM
      fnUrl = fn.addFunctionUrl({
        authType: lambda.FunctionUrlAuthType.NONE,
        invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      });

      // Extract host for CloudFront HttpOrigin
      const fnUrlHost = cdk.Fn.select(2, cdk.Fn.split("/", fnUrl.url));
      dynamicOrigin = new origins.HttpOrigin(fnUrlHost, {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      });
    } else {
      // API Gateway v2 (HTTP API) in front of Lambda
      const integration = new HttpLambdaIntegration(
        "ReactServerIntegration",
        fn,
        {
          payloadFormatVersion: apigwv2.PayloadFormatVersion.VERSION_2_0,
        }
      );

      const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
        defaultIntegration: integration,
      });

      // Extract host from the endpoint
      const apiHost = cdk.Fn.select(2, cdk.Fn.split("/", httpApi.apiEndpoint));
      dynamicOrigin = new origins.HttpOrigin(apiHost, {
        protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      });
    }

    let staticRoutes = Array.isArray(adapterConfig?.staticRoutes)
      ? adapterConfig.staticRoutes
      : [];

    // Edge function setup (if needed)
    let staticAssetsRoutingFunction = null;
    if (adapterConfig.routingMode === "edgeFunctionRouting") {
      staticRoutes.push("/___only_for_permissions___/");

      const staticFiles = JSON.parse(
        readFileSync(join(outDir, "static_files.json"), { encoding: "utf8" })
      );
      const staticAssetsRoutingTable =
        makeStaticAssetsRoutingTable(staticFiles);
      const staticAssetsRoutingTableData = JSON.stringify({
        data: staticAssetsRoutingTable,
      });
      const staticAssetsRoutingTableDataHash = createHash("sha256")
        .update(staticAssetsRoutingTableData)
        .digest("hex")
        .substring(0, 10);

      const staticAssetsRoutingTableKVStore = new cloudfront.KeyValueStore(
        this,
        "staticAssetsRoutingTable" + staticAssetsRoutingTableDataHash,
        {
          source: cloudfront.ImportSource.fromInline(
            staticAssetsRoutingTableData
          ),
        }
      );

      staticAssetsRoutingFunction = new cloudfront.Function(
        this,
        "staticAssetsRouting",
        {
          code: cloudfront.FunctionCode.fromInline(`
import cf from "cloudfront";

const STATIC_PUBLIC_S3 = "${staticBucket.bucketRegionalDomainName}";
const ASSETS_CLIENT_S3 = "${staticBucket.bucketRegionalDomainName}";
const domainNameOriginStaticAssetsMap = {
  s: STATIC_PUBLIC_S3,
  a: ASSETS_CLIENT_S3,
  c: ASSETS_CLIENT_S3,
  p: STATIC_PUBLIC_S3,
};
const kvsHandle = cf.kvs();

async function handler(event) {
  if (event.request.method === "GET") {
    let key = event.request.uri.substring(1).replace(/\\/$/, "");
     if (
      event.request.headers["accept"] &&
      event.request.headers["accept"]["value"] &&
      event.request.headers["accept"]["value"].includes("text/html") &&
      !key.endsWith(".html")
    ) {
      key += (key !== "" ? "/" : "") + "index.html";
    }
    try {
      const uriType = await kvsHandle.get(key);
      const domainNameOriginStaticAssets = domainNameOriginStaticAssetsMap[uriType];
      if (domainNameOriginStaticAssets === undefined) {
        throw new Error("No origin found for the key");
      }
      cf.updateRequestOrigin({
        domainName: domainNameOriginStaticAssets,
        originAccessControlConfig: {
          enabled: true,
          signingBehavior: "always",
          signingProtocol: "sigv4",
          originType: "s3",
        },
        customHeaders: {},
      });

      event.request.uri = "/" + key;
    } catch (_err) {
      // Key not found in KVS
    }
  }
  return event.request;
}`),
          keyValueStore: staticAssetsRoutingTableKVStore,
        }
      );
    }

    // 4) CloudFront distribution
    const s3Origin =
      origins.S3BucketOrigin.withOriginAccessControl(staticBucket);

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: dynamicOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        compressed: true,
        functionAssociations:
          adapterConfig.routingMode === "edgeFunctionRouting" &&
          staticAssetsRoutingFunction
            ? [
                {
                  eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
                  function: staticAssetsRoutingFunction,
                },
              ]
            : [],
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/404",
          ttl: Duration.seconds(10),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/404",
          ttl: Duration.seconds(10),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // 5) BREAK CIRCULAR DEPENDENCY: Use custom resource to update Lambda env AFTER distribution is created
    const updateLambdaEnv = new cr.AwsCustomResource(
      this,
      "UpdateLambdaOriginEnv",
      {
        onCreate: {
          service: "Lambda",
          action: "updateFunctionConfiguration",
          parameters: {
            FunctionName: fn.functionName,
            Environment: {
              Variables: {
                NODE_ENV: "production",
                DEBUG: lambdaEnv.DEBUG ?? "react-server-adapter",
                ...lambdaEnv,
                ORIGIN: `https://${distribution.distributionDomainName}`,
              },
            },
          },
          physicalResourceId: cr.PhysicalResourceId.of("lambda-env-update"),
        },
        onUpdate: {
          service: "Lambda",
          action: "updateFunctionConfiguration",
          parameters: {
            FunctionName: fn.functionName,
            Environment: {
              Variables: {
                NODE_ENV: "production",
                DEBUG: lambdaEnv.DEBUG ?? "react-server-adapter",
                ...lambdaEnv,
                ORIGIN: `https://${distribution.distributionDomainName}`,
              },
            },
          },
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: [fn.functionArn],
        }),
      }
    );

    // Ensure Lambda env is updated after distribution is created
    updateLambdaEnv.node.addDependency(distribution);

    // 6) Deploy static assets (no dependency on Lambda env)
    new s3deploy.BucketDeployment(this, "DeployStatic", {
      destinationBucket: staticBucket,
      memoryLimit: 1024,
      distribution,
      prune: true,
      sources: [
        s3deploy.Source.asset(staticDir, {
          exclude: ["client/**/*", "assets/**/*", "static/**/*.x-component"],
          cacheControl: [
            s3deploy.CacheControl.setPublic(),
            s3deploy.CacheControl.maxAge(Duration.days(0)),
            s3deploy.CacheControl.sMaxAge(Duration.days(1)),
            s3deploy.CacheControl.staleWhileRevalidate(Duration.days(1)),
          ],
        }),
        s3deploy.Source.asset(staticDir, {
          exclude: ["client/**/*", "assets/**/*"],
          include: ["**/*.x-component"],
          metadata: {
            contentType: "text/x-component",
            cacheControl: [
              s3deploy.CacheControl.setPublic(),
              s3deploy.CacheControl.maxAge(Duration.days(0)),
              s3deploy.CacheControl.sMaxAge(Duration.days(1)),
              s3deploy.CacheControl.staleWhileRevalidate(Duration.days(1)),
            ],
          },
        }),
        s3deploy.Source.asset(staticDir, {
          include: ["client/**/*", "assets/**/*"],
          metadata: {
            cacheControl: [
              s3deploy.CacheControl.setPublic(),
              s3deploy.CacheControl.maxAge(Duration.days(365)),
              s3deploy.CacheControl.sMaxAge(Duration.days(365)),
            ],
          },
        }),
      ],
    });

    // Static path behaviors
    if (adapterConfig.routingMode === "pathBehaviors") {
      const topLevelStructure = readdirSync(staticDir, {
        withFileTypes: true,
      }).reduce(
        (result, item) => {
          if (item.isDirectory()) {
            result.dirs.push(item.name);
          } else if (item.isFile()) {
            result.files.push(item.name);
          }
          return result;
        },
        { dirs: [], files: [] }
      );

      if (topLevelStructure.files.length > 0) {
        throw new Error(
          `Static directory (${staticDir}) must not contain files at the root level; please move them into a top-level folder.`
        );
      }

      if (topLevelStructure.dirs.length > maxBehaviors - 1) {
        throw new Error(
          `The number of static routes exceeds the maximum number of ${maxBehaviors} behaviors allowed by CloudFront.`
        );
      }
      staticRoutes.push(...topLevelStructure.dirs);
    }

    for (const dir of staticRoutes) {
      distribution.addBehavior(`/${dir}/*`, s3Origin, {
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        responseHeadersPolicy:
          cloudfront.ResponseHeadersPolicy
            .CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      });
    }

    // 7) Outputs
    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: distribution.distributionId,
    });
    new cdk.CfnOutput(this, "CloudFrontDomainName", {
      value: distribution.distributionDomainName,
    });
    new cdk.CfnOutput(this, "LambdaFunctionName", {
      value: fn.functionName,
    });
    if (fnUrl) {
      new cdk.CfnOutput(this, "FunctionUrl", {
        value: fnUrl.url,
      });
    }
  }
}

export default ReactServerAwsStack;
