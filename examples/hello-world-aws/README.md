# Deploy Adapter AWS

AWS adapter for [@lazarv/react-server](https://npmjs.com/package/@lazarv/react-server).

The bundling of the app for deployment to AWS Lambda requires the aws adapter in `react-server.config.json`:

```json
{
  "root": "src",
  "adapter": "@lazarv/react-server-adapter-aws"
}
```

See details at https://react-server.dev/deploy/aws.
