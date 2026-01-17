FROM node:20-alpine

# Install yt-dlp, dependencies, and deno
RUN apk add --no-cache python3 py3-pip ffmpeg curl unzip
RUN pip3 install --break-system-packages yt-dlp

# Install deno for yt-dlp JavaScript extraction
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Build Next.js app
RUN npm run build

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
