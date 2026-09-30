FROM node:22-bookworm AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN find src -type f \( -name "*.js" -o -name "*.jsx" \) -exec sed -i 's#http://localhost:3000##g' {} +
RUN npm run build

FROM node:22-bookworm
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ ./
COPY --from=frontend-build /frontend/dist ./public
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]