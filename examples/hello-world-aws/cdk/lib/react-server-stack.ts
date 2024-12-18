#!/usr/bin/env node
import "source-map-support/register";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import * as cdk from "aws-cdk-lib";
import * as api from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origin from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

import type { CustomStackProps } from "../bin/infrastructure";

export class ReactServerStack extends cdk.Stack {
  readonly distributionUrlParameterName = `/${this.stackName}/distribution/url`;

  constructor(scope: Construct, id: string, props: CustomStackProps) {
    super(scope, id, props);

    const cwd = process.cwd();
    const awsDirectory = join(
      cwd,
      props.frameworkOutDir ?? ".aws-react-server"
    );
    const awsOutputDirectory = join(awsDirectory, "output");

    const certificate =
      props?.certificate && typeof props?.certificate !== "string"
        ? props?.certificate
        : undefined;

    const hostedZone = props?.hostedZone;
    const subDomain = props?.subDomain;
    const domainName = props?.domainName;
    const siteDomainName = domainName
      ? `${(subDomain?.length ?? 0 > 0) ? `${subDomain}.` : ""}${domainName}`
      : undefined;

    const bucketClientAssets = new s3.Bucket(this, "StaticClientAssetsBucket", {
      /**
       * The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
       * the new bucket, and it will remain in your account until manually deleted. By setting the policy to
       * DESTROY, cdk destroy will attempt to delete the bucket, but will error if the bucket is not empty.
       */
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code

      /**
       * For sample purposes only, if you create an S3 bucket then populate it, stack destruction fails.  This
       * setting will enable full cleanup of the demo.
       */
      autoDeleteObjects: true, // NOT recommended for production code
    });

    const bucket = new s3.Bucket(this, "StaticAssetsBucket", {
      /**
       * The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
       * the new bucket, and it will remain in your account until manually deleted. By setting the policy to
       * DESTROY, cdk destroy will attempt to delete the bucket, but will error if the bucket is not empty.
       */
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code

      /**
       * For sample purposes only, if you create an S3 bucket then populate it, stack destruction fails.  This
       * setting will enable full cleanup of the demo.
       */
      autoDeleteObjects: true, // NOT recommended for production code
    });

    // Create a Lambda function for the backend

    const fn = new lambda.Function(this, "RequestHandler", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler", // Adjust to your handler file and function
      code: lambda.Code.fromAsset(
        join(awsOutputDirectory, "functions", "index.func")
      ), // Path to your Lambda function code
      environment: {
        NODE_ENV: "production",
      },

      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.THREE_DAYS,
      tracing: lambda.Tracing.ACTIVE,
    });

    const integration = new HttpLambdaIntegration(
      "RequestHandlerIntegration",
      fn,
      {
        payloadFormatVersion: api.PayloadFormatVersion.VERSION_2_0,
      }
    );

    const httpApi = new api.HttpApi(this, "WebsiteApi", {
      defaultIntegration: integration,
    });

    const httpApiUrl = `${httpApi.httpApiId}.execute-api.${cdk.Stack.of(this).region}.${cdk.Stack.of(this).urlSuffix}`;

    const staticDirectory = join(awsOutputDirectory, "static");

    const staticAssetsRoutingTabel =
      this.loadStaticAssetsRoutingTable(awsDirectory);
    const staticAssetsRoutingTabelData = JSON.stringify({
      data: staticAssetsRoutingTabel,
    });
    const staticAssetsRoutingTabelDataHash = createHash("sha256")
      .update(staticAssetsRoutingTabelData)
      .digest("hex")
      .substring(0, 10);
    console.log("Static routing table data:", staticAssetsRoutingTabelData);
    // Upload indexHtmlFiles to CloudFront KeyValueStore
    const staticAssetsRoutingTabelKVStore = new cloudfront.KeyValueStore(
      this,
      "staticAssetsRoutingTabel" + staticAssetsRoutingTabelDataHash, //needed to update data
      {
        source: cloudfront.ImportSource.fromInline(
          staticAssetsRoutingTabelData
        ),
      }
    );

    const staticAssetsRoutingFunction = new cloudfront.Function(
      this,
      "staticAssetsRouting",
      {
        code: cloudfront.FunctionCode.fromInline(`
import cf from "cloudfront";

const domainNameOrginStaticAssets = "${bucket.bucketRegionalDomainName}";
const kvsHandle = cf.kvs();

async function handler(event) {
  if (event.request.method === "GET") {
    let key = event.request.uri
      .substring(1)
      .toLowerCase()
      .replace(/\\/$/, ""); // Slash needs to be escaped in Cloud function creator
    if (
      event.request.headers["accept"] &&
      event.request.headers["accept"]["value"] &&
      event.request.headers["accept"]["value"].includes("text/html") &&
      !key.endsWith(".html")
    ) {
      key += (key !== "" ? "/" : "") + "index.html";
    }
    try {
      await kvsHandle.get(key);
      cf.updateRequestOrigin({
        domainName: domainNameOrginStaticAssets,
        originAccessControlConfig: {
          enabled: true,
          signingBehavior: "always",
          signingProtocol: "sigv4",
          originType: "s3",
        },
        // Empty object resets any header configured on the assigned origin
        customHeaders: {},
      });

      event.request.uri = "/" + key;
      // eslint-disable-next-line no-unused-vars
    } catch (_err) {
      // Key not found in KVS
    }
  }
  return event.request;
}
  `),
        keyValueStore: staticAssetsRoutingTabelKVStore,
      }
    );

    const requestHandlerBehavior: cloudfront.AddBehaviorOptions = {
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      // CACHING_OPTIMIZED is needed as the orgin change still uses the default behavior.
      // Without this change none of the static assets are cached by CloudFront
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED, //CACHING_DISABLED,
      // https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html
      originRequestPolicy:
        cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      compress: true,
      functionAssociations: [
        {
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          function: staticAssetsRoutingFunction,
        },
      ],
    };

    const assetClientOrigin =
      origin.S3BucketOrigin.withOriginAccessControl(bucketClientAssets);

    const assetOrigin = origin.S3BucketOrigin.withOriginAccessControl(bucket);
    const assetBehaviorOptions = {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      compress: true,
    };

    // Create a CloudFront distribution with custom behaviors
    const requestHandlerOrigin = new origin.HttpOrigin(httpApiUrl);

    const distribution = new cloudfront.Distribution(this, "CloudFront", {
      defaultBehavior: {
        origin: requestHandlerOrigin,
        ...requestHandlerBehavior,
      },
      domainNames: siteDomainName ? [siteDomainName] : undefined,
      certificate,
      enableIpv6: true,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    distribution.addBehavior(
      `/assets/*`,
      assetClientOrigin,
      assetBehaviorOptions
    );

    distribution.addBehavior(
      `/client/*`,
      assetClientOrigin,
      assetBehaviorOptions
    );

    // only used to set the permissions for the origins to be accessed by this CloudFront distribution
    distribution.addBehavior(
      `/___only_for_permissions___/*`,
      assetOrigin,
      assetBehaviorOptions
    );

    // Deploy static client code and assets with cache breakers to the S3 bucket and invalidate the CloudFront cache
    new s3deploy.BucketDeployment(this, "DeployClientAssets", {
      sources: [s3deploy.Source.asset(join(staticDirectory, "client_assets"))],
      destinationBucket: bucketClientAssets,
      distribution,
      prune: true,
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.days(365)),
        s3deploy.CacheControl.sMaxAge(cdk.Duration.days(365)),
      ],
    });

    // Deploy static assets from public folder and static pages to the S3 bucket and invalidate the CloudFront cache
    new s3deploy.BucketDeployment(this, "DeployStaticHTMLAssets", {
      sources: [s3deploy.Source.asset(join(staticDirectory, "public"))],
      destinationBucket: bucket,
      distribution,
      prune: true,
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.days(0)),
        s3deploy.CacheControl.sMaxAge(cdk.Duration.days(1)),
        s3deploy.CacheControl.staleWhileRevalidate(cdk.Duration.days(1)),
      ],
      include: ["*"],
      exclude: ["*.x-component"], // exclude RSC components as they need a different content type
    });

    // Deploy RSC static assets to the S3 bucket and invalidate the CloudFront cache
    new s3deploy.BucketDeployment(this, "DeployStaticRSCAssets", {
      sources: [s3deploy.Source.asset(join(staticDirectory, "public"))],
      destinationBucket: bucket,
      distribution,
      prune: true,
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(cdk.Duration.days(0)),
        s3deploy.CacheControl.sMaxAge(cdk.Duration.days(1)),
        s3deploy.CacheControl.staleWhileRevalidate(cdk.Duration.days(1)),
      ],
      exclude: ["*"],
      include: ["*.x-component"],
      contentType: "text/x-component", // needed for RSC components
    });

    // Create a Route 53 alias record pointing to the CloudFront distribution
    if (hostedZone) {
      new route53.ARecord(this, "AliasRecord", {
        zone: hostedZone,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(distribution)
        ),
        recordName: subDomain ?? "", // This will create a record for www.example.com
      });
    }

    // Store the CloudFront URL in an SSM parameter
    new ssm.StringParameter(this, "DistributionUrlParameter", {
      parameterName: this.distributionUrlParameterName,
      stringValue: siteDomainName
        ? siteDomainName!
        : distribution.distributionDomainName,
      tier: ssm.ParameterTier.STANDARD,
    });

    // Output the CloudFront URL and API endpoint
    new cdk.CfnOutput(this, "CloudFrontURL", {
      value: `https://${siteDomainName ? siteDomainName : distribution.distributionDomainName}`,
    });

    new cdk.CfnOutput(this, "CloudFrontID", {
      value: distribution.distributionId,
    });
  }

  private loadStaticAssetsRoutingTable(awsDirectory: string) {
    const staticFiles = JSON.parse(
      readFileSync(join(awsDirectory, "static_files.json"), {
        encoding: "utf8",
      })
    );
    const fileTypeMap: { [key: string]: string } = {
      static: "s",
      // assets: "a",
      // client: "c",
      public: "p",
    }; // other types are ignored

    const staticAssetsRoutingTabel = Object.keys(staticFiles).flatMap(
      (filetyp: string) => {
        if (fileTypeMap?.[filetyp]) {
          return staticFiles[filetyp].map((path: string) => ({
            key: path,
            value: fileTypeMap[filetyp],
          }));
        }
        return [];
      }
    );
    return staticAssetsRoutingTabel;
  }
}
