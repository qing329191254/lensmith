# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY client/package.json ./client/

RUN pnpm install --frozen-lockfile

COPY client ./client
RUN pnpm --filter lensmith-client build

FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html

EXPOSE 80
