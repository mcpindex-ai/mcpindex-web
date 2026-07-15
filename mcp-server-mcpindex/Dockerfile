# Dockerfile for mcp-server-mcpindex - the mcpindex.ai directory client MCP server.
# Used by the Docker MCP Registry to build and sign the image. stdio transport,
# zero-config (it queries the public mcpindex.ai API; no credentials required).
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src/ ./src/
ENTRYPOINT ["node", "src/index.mjs"]
