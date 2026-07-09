# Local development image: installs deps at build time, then runs the
# NestJS watch server against source bind-mounted in by docker-compose.
FROM node:26-slim

RUN npm install -g corepack@latest && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 6969
CMD ["pnpm", "dev"]
