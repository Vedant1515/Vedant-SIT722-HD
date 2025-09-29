# Simple Nginx to serve static React page and proxy /api to backend service in the cluster
FROM nginx:1.27-alpine
COPY public /usr/share/nginx/html
# default.conf injects a proxy pass for /api to backend service DNS within K8s
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
