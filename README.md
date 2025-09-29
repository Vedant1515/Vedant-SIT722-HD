# NewsFlow - End-to-end DevOps Demo on AKS + ACR + Azure Storage

NewsFlow is a minimal news aggregation web app that demonstrates a complete DevOps pipeline on Azure using only:
- Azure Container Registry (ACR)
- Azure Kubernetes Service (AKS)
- Azure Storage Account (Azure Files via CSI)

The app has:
- **Backend**: Node.js Express service that proxies NewsAPI.org and exposes Prometheus metrics
- **Frontend**: Simple React UI served by Nginx
- **IaC**: OpenTofu to provision ACR, AKS, Storage Account
- **Kubernetes**: Blue-green deployment for the backend, HPA, Prometheus stack, Grafana
- **CI/CD**: GitHub Actions for build, push, deploy, and optional infra provisioning

> Focus is on DevOps excellence. Application is deliberately simple.

## Quick Start - Local (optional)

```bash
# 1) Backend
cd backend
cp .env.example .env   # fill NEWSAPI_KEY
npm i
npm test
npm start

# 2) Frontend (served by nginx in container only), but you can open public/index.html locally for a rough preview.
```

## Docker Build locally

```bash
# Backend
docker build -t newsflow-backend:local ./backend
# Frontend
docker build -t newsflow-frontend:local ./frontend
```

## OpenTofu - Infra as Code (optional zero-touch)

This creates resource group, ACR, AKS, Storage. You can run it locally or via the provided GitHub Actions workflow.

1. Edit `infra/variables.tf` defaults to your values.
2. Authenticate with Azure: `az login`
3. In `infra/`:
```bash
tofu init
tofu plan -out tfplan
tofu apply tfplan
```

### Outputs
- `kubeconfig_raw`: raw Kubeconfig for the cluster
- `acr_login_server`, `acr_admin_username`, `acr_admin_password`: for GitHub Actions docker login (admin enabled)
- Storage account name and key for Azure Files

Set `AKS_KUBECONFIG` GitHub secret to the **base64-encoded** kubeconfig content:
```bash
# after tofu apply, save kubeconfig to a file then
base64 -w0 kubeconfig.yaml > kubeconfig.b64
# paste content into AKS_KUBECONFIG secret
```

## Kubernetes - Deploy order

```bash
# Namespaces
kubectl apply -f k8s/namespace-staging.yaml
kubectl apply -f k8s/namespace-prod.yaml

# Storage secret (replace placeholders)
kubectl -n staging create secret generic azure-storage-secret \
  --from-literal=azurestorageaccountname=<storageAccountName> \
  --from-literal=azurestorageaccountkey=<storageAccountKey>

kubectl -n prod create secret generic azure-storage-secret \
  --from-literal=azurestorageaccountname=<storageAccountName> \
  --from-literal=azurestorageaccountkey=<storageAccountKey>

# NewsAPI secret (replace placeholders)
kubectl -n staging create secret generic newsapi-secret --from-literal=NEWSAPI_KEY=<yourNewsApiKey>
kubectl -n prod create secret generic newsapi-secret --from-literal=NEWSAPI_KEY=<yourNewsApiKey>

# Config
kubectl -n staging apply -f k8s/backend-config.yaml
kubectl -n prod apply -f k8s/backend-config.yaml

# PV/PVC
kubectl -n staging apply -f k8s/storage-azurefile.yaml
kubectl -n prod apply -f k8s/storage-azurefile.yaml

# Backend blue-green - start with blue active
kubectl -n staging apply -f k8s/backend-deploy-blue.yaml
kubectl -n staging apply -f k8s/backend-deploy-green.yaml
kubectl -n staging apply -f k8s/backend-service.yaml
kubectl -n staging apply -f k8s/backend-hpa.yaml

kubectl -n prod apply -f k8s/backend-deploy-blue.yaml
kubectl -n prod apply -f k8s/backend-deploy-green.yaml
kubectl -n prod apply -f k8s/backend-service.yaml
kubectl -n prod apply -f k8s/backend-hpa.yaml

# Frontend
kubectl -n staging apply -f k8s/frontend-deploy.yaml
kubectl -n prod apply -f k8s/frontend-deploy.yaml

# Prometheus + Grafana (via helm)
# Ensure helm is installed and kube context is set to your cluster
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install kube-prometheus-stack in each namespace or only in staging
helm upgrade --install monitor prometheus-community/kube-prometheus-stack \
  -n staging -f k8s/prometheus/values-kube-prom.yaml --create-namespace

# Scrape backend metrics
kubectl -n staging apply -f k8s/prometheus/backend-servicemonitor.yaml
```

## Blue-Green switch

Service selector decides which color gets live traffic. Use the helper script:
```bash
# set service to green
bash k8s/scripts/switch_color.sh staging green

# set service back to blue
bash k8s/scripts/switch_color.sh staging blue
```

The GitHub Actions deploy job performs this during production rollout.

## GitHub Actions - Required Secrets

Repository Settings - Secrets and variables - Actions - New repository secret:

- `ACR_LOGIN_SERVER` - like `vedantacr.azurecr.io`
- `ACR_USERNAME` - ACR admin user
- `ACR_PASSWORD` - ACR admin password
- `AKS_KUBECONFIG` - base64 of kubeconfig content
- `NEWSAPI_KEY` - API key from newsapi.org
- `AZ_SUBSCRIPTION_ID` - only if using infra workflow
- `AZ_TENANT_ID` - only if using infra workflow
- `AZ_CLIENT_ID` - only if using infra workflow (SPN app id)
- `AZ_CLIENT_SECRET` - only if using infra workflow (SPN secret)

## Access the app

- Frontend Service is `LoadBalancer`, so it gets a public IP in each namespace.
- `kubectl -n staging get svc frontend-svc`
- Open the `EXTERNAL-IP` in your browser.

## Video narration outline

1. Intro - what I built and why DevOps first
2. IaC OpenTofu - resources and outputs
3. CI - build and push to ACR
4. CD to staging - apply manifests, HPA, storage mount
5. Prometheus, Grafana - metrics and dashboards
6. Blue-green rollout to production - switch selector, rollback demo
7. Wrap up - what I learned and how others can replicate
