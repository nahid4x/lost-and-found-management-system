FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p /app/uploads/reports && chown -R node:node /app
USER node
ENV NODE_ENV=production PORT=4100
EXPOSE 4100
CMD ["node", "src/index.js"]
