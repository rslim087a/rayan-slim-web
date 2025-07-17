#!/bin/bash

# Set your Docker Hub username
DOCKER_USERNAME="rslim087"
IMAGE_NAME="devops-universe"
TAG="latest"

# Login to Docker Hub (optional - do this if you want to push the image)
# docker login

# Build multi-architecture image
echo "Building multi-architecture image for ARM and AMD64..."
docker buildx create --name mybuilder --use
docker buildx inspect --bootstrap

# Build and push to Docker Hub
# docker buildx build --platform linux/amd64,linux/arm64 -t $DOCKER_USERNAME/$IMAGE_NAME:$TAG --push .

# OR build locally without pushing
docker buildx build --platform linux/amd64,linux/arm64 -t $IMAGE_NAME:$TAG --load .

echo "Image built successfully: $IMAGE_NAME:$TAG"
echo "To run the container: docker run -p 3000:3000 --env-file .env $IMAGE_NAME:$TAG"