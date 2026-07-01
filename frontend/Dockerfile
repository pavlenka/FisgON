FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Se sirve bajo prasoft.es/fisgon/ (sin subdominio), así que todas las rutas de
# assets del build deben ir prefijadas con /fisgon/.
RUN npm run build -- --base=/fisgon/

FROM nginx:1.27-alpine
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist /usr/share/nginx/html/fisgon
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
