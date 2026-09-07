FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY . .

# Expose web port
EXPOSE 80

# Persistent volumes for session and uploads
VOLUME ["/app/data", "/app/uploads"]

# Start application
CMD ["node", "server.js"]
