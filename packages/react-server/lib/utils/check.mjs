import { createRequire } from "node:module";

import colors from "picocolors";
import semver from "semver";

export function checkNodejsVersion() {
  const minNodeVersion = "20.10.0";
  if (
    semver.lt(process.versions.node, minNodeVersion, {
      loose: true,
    })
  ) {
    console.log(`Node.js version ${colors.cyan(`v${minNodeVersion}`)} or higher is required to use ${colors.cyan("@lazarv/react-server")}.
You are currently running Node.js ${colors.cyan(process.version)}.
Please upgrade your Node.js version.
      `);
    return true;
  }
}

export function checkBunVersion() {
  const minBunVersion = "1.1.45";
  if (
    semver.lt(process.versions.bun, minBunVersion, {
      loose: true,
    })
  ) {
    console.log(`Bun version ${colors.cyan(`v${minBunVersion}`)} or higher is required to use ${colors.cyan("@lazarv/react-server")}.
You are currently running Bun ${colors.cyan(`v${process.versions.bun}`)}.
Please upgrade your Bun version.
      `);
    return true;
  }
}

export function checkJSRuntimeVersion() {
  if (typeof Bun !== "undefined") {
    return checkBunVersion();
  } else {
    return checkNodejsVersion();
  }
}

export async function checkReactDependencies() {
  let uninstall = [];
  const __require = createRequire(import.meta.url);
  const { default: packageJson } = await import(
    "@lazarv/react-server/package.json",
    { with: { type: "json" } }
  );
  await Promise.all(
    ["react", "react-dom", "react-server-dom-webpack"].map(async (pkg) => {
      try {
        const pkgPath = __require.resolve(`${pkg}/package.json`, {
          paths: [process.cwd()],
        });
        const {
          default: { version: userPkgVersion },
        } = await import(pkgPath, { with: { type: "json" } });
        const systemPkgVersion =
          packageJson.dependencies?.[pkg] ||
          packageJson.peerDependencies?.[pkg];
        if (userPkgVersion !== systemPkgVersion) {
          uninstall.push(
            `  ${colors.cyan(`${pkg}@${userPkgVersion}`)} ${colors.red(`expected: ${pkg}@${systemPkgVersion}`)} \n`
          );
        }
      } catch {
        // Do nothing
      }
    })
  );

  if (uninstall.length > 0) {
    console.log(`You don't need to install ${colors.cyan("react")}, ${colors.cyan("react-dom")} or ${colors.cyan("react-server-dom-webpack")} in your project.
${colors.cyan("@lazarv/react-server")} already includes a specific version of ${colors.cyan("react")}, ${colors.cyan("react-dom")} and ${colors.cyan("react-server-dom-webpack")} that is compatible with the current version of ${colors.cyan("@lazarv/react-server")}.
You can remove the following packages from your project:
${uninstall.join("")}`);
    return true;
  }
}
