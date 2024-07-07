# @lazarv/react-server contribution guide

We are thrilled that you are interested in contributing to this framework! You can contribute in many ways.

* as a developer
* as a technical writer
* just by giving feedback
* let us know!

## Developers

To fix an issue, to provide a new feature or create a new example app, follow these steps:

1. [fork](https://github.com/lazarv/react-server/fork) the repo on GitHub
2. clone the forked repo by running `git clone https://github.com/<your-github-username>/react-server.git`
3. install dependencies using `pnpm i`
4. create a [test](https://github.com/lazarv/react-server/tree/main/test) or an [example](https://github.com/lazarv/react-server/tree/main/examples) app
5. run tests using `pnpm test`
6. run an example using `pnpm --filter ./examples/<example-name>`
7. add your code
8. create a pull request

We are using the latest [pnpm](https://pnpm.io) version as the package manager, so don't forget to enable Corepack using `corepack enable`.

The framework is written purely in 100% JavaScript, so we don't need any build steps anywhere in the core codebase. But as Vite supports both JS/TS, any app code can be implemented using plain JavaScript or using TypeScript, when needed. We leave this to the developer of the app and we provide module level TypeScript definitions to provide types for the app developer.

## Technical writers

To fix or add more content to the documentation, do the same as a developer and run the documentation site locally using `pnpm --filter ./docs dev`. Change content in the [guide](https://github.com/lazarv/react-server/tree/main/docs/src/pages/en/guide) or in the [README](https://github.com/lazarv/react-server/blob/main/README.md).

## Feedback

Feedback is extremely important! Create a new GitHub [issue](https://github.com/lazarv/react-server/issues) or get in contact on [X](https://x.com/lazarv1982) and tell us about your experience with this framework.

## Other

If you have any other ideas on contribution, don't hold back and let us know!