# Define build argument for port with default value
ARG PORT=3000

# Stage 1: Build
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first to check for corepack and lock files
COPY package.json pnpm-lock.yaml ./

# Install pnpm using corepack or npm
RUN --mount=type=cache,target=/root/.npm \
  if grep -q "\"packageManager\":" "package.json"; then \
  corepack enable && corepack prepare; \
  else \
  npm install -g pnpm; \
  fi

# Install dependencies using pnpm
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

# Copy source files and .react-server directory
COPY . .

# Build using pnpm
RUN pnpm run build

# Stage 2: Production
FROM node:20-alpine AS runner

# Forward the build argument
ARG PORT
ENV PORT=$PORT

# Set working directory
WORKDIR /app

# Copy package files and lock files
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./

# Install pnpm in production stage
RUN --mount=type=cache,target=/root/.npm \
  if grep -q "\"packageManager\":" "package.json"; then \
  corepack enable && corepack prepare; \
  else \
  npm install -g pnpm; \
  fi

# Copy package.json, pnpm-lock.yaml, node_modules and .react-server from builder stage
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.react-server ./.react-server

# Prune dev dependencies using pnpm
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
  pnpm prune --prod

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001 && \
  chown -R nodejs:nodejs /app
USER nodejs

# Expose the port your app runs on
EXPOSE ${PORT}

# Start the application using pnpm
CMD ["pnpm", "start", "--host"]
