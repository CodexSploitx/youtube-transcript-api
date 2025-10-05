# Use Node.js 18 Alpine as base image for smaller size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY index.ts ./

# Install TypeScript globally for compilation
RUN npm install -g typescript

# Compile TypeScript to JavaScript
RUN npm run build

# Remove TypeScript files and dev dependencies to reduce image size
RUN rm -rf node_modules && \
    npm ci --only=production && \
    rm index.ts tsconfig.json

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port 3000
EXPOSE 3000

# Set environment variable for production
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (res) => { process.exit(res.statusCode === 400 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/index.js"]