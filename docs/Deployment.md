# System Design Co-Pilot – Deployment Guide (GKE + Artifact Registry)

This guide explains, step by step, how to build, configure, and deploy the **System Design Co-Pilot** Node.js application to **Google Kubernetes Engine (GKE Autopilot)** using **Google Artifact Registry** and **Kubernetes Secrets**.

It is written so that:
- A new engineer can follow it end‑to‑end.
- A reviewer/recruiter can quickly see the architectural and security choices.

---

## 0. Overview

**Stack**

- Backend: Node.js + Express (`src/index.ts`)
- Frontend: Static assets served from `public/`
- Container: Docker image (non‑root user, built for `linux/amd64`)
- Orchestrator: GKE Autopilot
- Image registry: Google Artifact Registry (Docker)
- Secrets: Kubernetes Secrets (no credentials baked into images)

**Core Kubernetes resources**

- Namespace: `sd-copilot`
- Deployment: `sd-copilot-deployment`
- Service: `sd-copilot-service` (ClusterIP)
- Ingress: `sd-copilot-ingress` (GCE HTTP(S) Load Balancer)
- Secret: `sd-copilot-secrets`

> **Note:** DNS / Cloudflare setup for the Ingress is intentionally out of scope here and can be handled later.

---

## 1. Prerequisites

### 1.1 Accounts and permissions

You need:

- A Google account.
- A Google Cloud project with billing enabled.
- Basic familiarity with a terminal.

In this guide we assume:

- **Project ID**: `system-design-copilot-140494`
- **Region**: `us-central1`

You can adapt these values for another project/region if needed.

### 1.2 Tools installed locally

Install the following on your local machine:

1. **Google Cloud SDK** (includes `gcloud` and `kubectl`):  
   https://cloud.google.com/sdk/docs/install
2. **Docker Desktop** (for building and running containers):  
   https://www.docker.com/products/docker-desktop
3. **Node.js + npm** (for local development):  
   https://nodejs.org/

After installing, verify:

```bash
node -v
npm -v
gcloud version
kubectl version --client
docker version
```

If all commands succeed, you are ready to continue.

---

## 2. One‑time Google Cloud setup

### 2.1 Set project and region

```bash
export PROJECT_ID=system-design-copilot-140494
export REGION=us-central1

# Tell gcloud which project and region to use by default
gcloud config set project "$PROJECT_ID"
gcloud config set compute/region "$REGION"
```

### 2.2 Enable required APIs

```bash
gcloud services enable artifactregistry.googleapis.com
gcloud services enable container.googleapis.com
```

### 2.3 Install GKE auth plugin (for kubectl)

```bash
gcloud components install gke-gcloud-auth-plugin
```

If you open a new terminal later, this plugin will already be available.

### 2.4 Authenticate Docker to Artifact Registry

```bash
gcloud auth configure-docker "$REGION-docker.pkg.dev"
```

This updates your local Docker config so pushes to `*.pkg.dev` use your gcloud credentials.

---

## 3. Create the GKE Autopilot cluster (one‑time)

Create an Autopilot cluster to run the app:

```bash
export CLUSTER_NAME=sd-copilot-cluster

gcloud container clusters create-auto "$CLUSTER_NAME" \
  --region "$REGION"
```

Fetch cluster credentials so `kubectl` talks to this cluster:

```bash
gcloud container clusters get-credentials "$CLUSTER_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID"
```

Confirm you can see the cluster:

```bash
kubectl cluster-info
kubectl get nodes
```

On Autopilot you may or may not see nodes immediately, but the cluster should be reachable and `kubectl` should not error.

---

## 4. Local project setup

Clone the repository and install dependencies:

```bash
# From your workspace directory
git clone <REPO_URL> system-design-copilot
cd system-design-copilot

npm install
```

> Replace `<REPO_URL>` above with the actual Git repository URL for this project.

### 4.1 Local environment variables

Create a local `.env` file at the project root. **Do not commit this file.**

Example (values are placeholders):

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
REDIS_URL=redis://default:password@host:6379
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
OPENAI_API_KEY=sk-...
PORT=3000
```

Ensure `.gitignore` includes:

```gitignore
.env
.env.*
```

The application loads this file in local development via `dotenv`.

### 4.2 Local sanity check

Run the app locally:

```bash
npm run start
```

Open in a browser:

- `http://localhost:3000/`
- `http://localhost:3000/api/v1/health/live`
- `http://localhost:3000/api/v1/health/ready`

Press `Ctrl + C` to stop the server when finished.

---

## 5. Docker image build and push

We build a Docker image, push it to **Google Artifact Registry**, and then deploy that image to the cluster.

### 5.1 Create the Artifact Registry repository (one‑time)

```bash
export REPO=sd-copilot

gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="System Design Co-Pilot images"
```

If the repository already exists, you will see an `ALREADY_EXISTS` message, which is safe to ignore.

### 5.2 Build the image for linux/amd64

GKE nodes run `linux/amd64`, while Apple Silicon Macs are `arm64`. To avoid platform issues, we explicitly build for `linux/amd64`.

```bash
export IMAGE_NAME=system-design-copilot
export TAG=v1   # Increment this for each new deployment (v2, v3, ...)

export FULL_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME:$TAG"

# Ensure we build for the same architecture as the GKE nodes
export DOCKER_DEFAULT_PLATFORM=linux/amd64

# Build the Docker image from the Dockerfile in the project root
docker build -t sd-copilot:local .
```

Run the image locally to be sure it works:

```bash
docker run --rm -p 3000:3000 \
  -v "$(pwd)/.env:/app/.env" \
  sd-copilot:local
```

Visit `http://localhost:3000/` and `http://localhost:3000/api/v1/health/live`. Press `Ctrl + C` to stop.

### 5.3 Tag and push to Artifact Registry

```bash
# Tag the local image with the Artifact Registry path
docker tag sd-copilot:local "$FULL_IMAGE"

# Push the image to Artifact Registry
docker push "$FULL_IMAGE"
```

You can verify the image in the registry:

```bash
gcloud artifacts docker images list \
  "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO"
```

You should see `system-design-copilot` listed with the digest and your tag.

---

## 6. Kubernetes manifests

All manifests live in the `k8s/` directory.

### 6.1 Namespace

`k8s/namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: sd-copilot
```

Apply:

```bash
kubectl apply -f k8s/namespace.yaml
```

### 6.2 Application secrets

Create a `k8s/secrets.env` file locally (not committed to git):

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
REDIS_URL=redis://default:password@host:6379
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
OPENAI_API_KEY=sk-...
```

Create or update the Kubernetes Secret:

```bash
kubectl delete secret sd-copilot-secrets -n sd-copilot 2>/dev/null || true

kubectl create secret generic sd-copilot-secrets \
  -n sd-copilot \
  --from-env-file=k8s/secrets.env
```

These values will be injected as environment variables into the running pods.

### 6.3 Deployment

`k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sd-copilot-deployment
  namespace: sd-copilot
  labels:
    app: sd-copilot
spec:
  # Start with 1 replica (can be scaled up later as quotas allow)
  replicas: 1
  selector:
    matchLabels:
      app: sd-copilot
  template:
    metadata:
      labels:
        app: sd-copilot
    spec:
      containers:
        - name: sd-copilot
          image: sd-copilot:placeholder  # Real image set at deploy time
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: sd-copilot-secrets
          env:
            - name: NODE_ENV
              value: "production"
            - name: PORT
              value: "3000"
          readinessProbe:
            httpGet:
              path: /api/v1/health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /api/v1/health/live
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
```

Apply:

```bash
kubectl apply -f k8s/deployment.yaml
```

### 6.4 Service

`k8s/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: sd-copilot-service
  namespace: sd-copilot
  annotations:
    cloud.google.com/neg: '{"ingress": true}'
spec:
  selector:
    app: sd-copilot
  ports:
    - name: http
      port: 80
      targetPort: 3000
  type: ClusterIP
```

Apply:

```bash
kubectl apply -f k8s/service.yaml
```

### 6.5 Ingress (load balancer)

`k8s/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sd-copilot-ingress
  namespace: sd-copilot
  annotations:
    kubernetes.io/ingress.class: "gce"
spec:
  defaultBackend:
    service:
      name: sd-copilot-service
      port:
        number: 80
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: sd-copilot-service
                port:
                  number: 80
```

> Later, you can add a `host:` entry and map it to a Cloudflare-protected domain. For initial testing, leaving the host blank is sufficient.

Apply:

```bash
kubectl apply -f k8s/ingress.yaml
```

---

## 7. First deployment flow (end‑to‑end)

From a clean checkout on a machine with prerequisites installed:

```bash
# 1) Configure gcloud
export PROJECT_ID=system-design-copilot-140494
export REGION=us-central1
export CLUSTER_NAME=sd-copilot-cluster
export REPO=sd-copilot
export IMAGE_NAME=system-design-copilot
export TAG=v1
FULL_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME:$TAG"

gcloud config set project "$PROJECT_ID"
gcloud config set compute/region "$REGION"

# 2) Ensure APIs are enabled
gcloud services enable artifactregistry.googleapis.com
gcloud services enable container.googleapis.com

# 3) Get cluster credentials
gcloud container clusters get-credentials "$CLUSTER_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID"

# 4) Build and push the image (linux/amd64)
export DOCKER_DEFAULT_PLATFORM=linux/amd64

docker build -t sd-copilot:local .
docker tag sd-copilot:local "$FULL_IMAGE"
docker push "$FULL_IMAGE"

gcloud artifacts docker images list \
  "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO" \
  --include-tags \
  --format='table(IMAGE, TAGS)'

# 5) Apply Kubernetes manifests
kubectl apply -f k8s/prod/namespace.yaml
kubectl apply -f k8s/prod/deploy.yaml
kubectl apply -f k8s/prod/service.yaml
kubectl apply -f k8s/prod/ingress.yaml

# 6) Create/update secrets (requires k8s/secrets.env)
kubectl delete secret sd-copilot-secrets -n sd-copilot 2>/dev/null || true
kubectl create secret generic sd-copilot-secrets \
  -n sd-copilot \
  --from-env-file=k8s/secrets.env

# 7) Point the Deployment at the pushed image
kubectl set image deployment/sd-copilot-deployment \
  sd-copilot="$FULL_IMAGE" \
  -n sd-copilot

# 8) Wait for the rollout to complete
kubectl rollout status deployment/sd-copilot-deployment -n sd-copilot

# 9) Inspect pods and logs
kubectl get pods -n sd-copilot
kubectl logs deployment/sd-copilot-deployment -n sd-copilot --tail=100
```

At this point the application should be running in the cluster.

---

## 8. Verifying the deployment

### 8.1 Internal check via port-forward

```bash
kubectl port-forward svc/sd-copilot-service -n sd-copilot 8080:80
```

Then in a browser or Postman:

- `http://localhost:8080/api/v1/health/live`
- `http://localhost:8080/api/v1/health/ready`
- `http://localhost:8080/`

Press `Ctrl + C` in the terminal to stop port-forwarding.

### 8.2 External check via Ingress IP

```bash
kubectl get ingress sd-copilot-ingress -n sd-copilot

kubectl get ingress sd-copilot-ingress -n sd-copilot \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}{"\n"}'
```

Use the printed IP in Postman or a browser:

- `http://<INGRESS_IP>/api/v1/health/live`
- `http://<INGRESS_IP>/api/v1/health/ready`
- `http://<INGRESS_IP>/`

DNS + Cloudflare configuration can later map a friendly domain to this IP.

---

## 9. Redeploying after code changes

When you change application code and want to redeploy:

```bash
# 1) Bump the image tag
export TAG=v2   # or v3, v4, ...
export FULL_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME:$TAG"

# 2) Build and push new image
export DOCKER_DEFAULT_PLATFORM=linux/amd64

docker build -t sd-copilot:local .
docker tag sd-copilot:local "$FULL_IMAGE"
docker push "$FULL_IMAGE"

# 3) Update deployment to use the new image
kubectl set image deployment/sd-copilot-deployment \
  sd-copilot="$FULL_IMAGE" \
  -n sd-copilot

# 4) Monitor rollout
kubectl rollout status deployment/sd-copilot-deployment -n sd-copilot
kubectl get pods -n sd-copilot
```

If there is an issue, you can roll back by setting the image back to a previous tag (for example `v1`).

---

## 10. Troubleshooting

**`ImagePullBackOff` with `no match for platform in manifest`**

- The image was built for `linux/arm64` on an Apple Silicon Mac.
- Fix by rebuilding with:
  ```bash
  export DOCKER_DEFAULT_PLATFORM=linux/amd64
  docker build -t sd-copilot:local .
  docker tag sd-copilot:local "$FULL_IMAGE"
  docker push "$FULL_IMAGE"
  ```

**`ImagePullBackOff` with `not found` or `manifest unknown`**

- The Deployment image tag does not exist in Artifact Registry.
- Verify with:
  ```bash
  gcloud artifacts docker images list "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO"
  ```
- Ensure the image tag in the Deployment exactly matches the pushed image.

**Readiness probe failures (`connection refused` on /api/v1/health/ready)**

- The application is not listening on port `3000`, or `/api/v1/health/ready` is not implemented.
- Verify logs:
  ```bash
  kubectl logs deployment/sd-copilot-deployment -n sd-copilot --tail=100
  ```
- Ensure the Express app defines `/api/v1/health/live` and `/api/v1/health/ready` and that `PORT` is set to `3000`.

**`getaddrinfo ENOTFOUND` connecting to Supabase Postgres from the pod**

- Some Supabase "Direct Connection" endpoints are IPv6-only, while this GKE Autopilot cluster egress is IPv4-only.
- From inside the pod, DNS lookups for the direct endpoint may return no IPv4 A records, causing `getaddrinfo ENOTFOUND`.
- Fix: use the Supabase Transaction/Session Pooler connection string, which exposes an IPv4-compatible endpoint and is better suited to many short-lived connections from pods.

**Missing environment variables / credentials**

- If the app logs errors about missing API keys or DB URLs, check that:
  - `k8s/secrets.env` contains the correct values.
  - The `sd-copilot-secrets` secret was recreated.
  - The Deployment has `envFrom.secretRef.name: sd-copilot-secrets`.

---

This deployment guide is intended to be self‑contained. An engineer can follow it from a fresh checkout to a fully running GKE deployment, and a reviewer can see the design decisions around containerization, security (non‑root image, secrets), and reliability (readiness/liveness probes, versioned images).