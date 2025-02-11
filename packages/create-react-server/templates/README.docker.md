# Build Docker image

To build your application into a Docker image, run:

```sh
docker build -t <%=props.projectName %> .
```

# Run Docker container

After building the Docker image, you can run the container with:

```sh
docker run --rm -ti -p <%=props.port %>:<%=props.port %> <%=props.projectName %>
```