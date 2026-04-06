FROM node:20-slim
RUN apt-get update && \
    apt-get install -y ffmpeg fonts-noto-cjk && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY server.js .
EXPOSE 7860
ENV PORT=7860
CMD ["node", "server.js"]
