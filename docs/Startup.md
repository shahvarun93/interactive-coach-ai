# System Design Co-Pilot – Startup & Shutdown Guide

This file explains **two main workflows**:

1. **Startup / Redeploy** – what to do when you change code and want it live on GKE.
2. **Shutdown / Cost Control** – how to pause or tear down resources to minimize charges.

Assumptions:

- Project root: `/Users/…/Project1`
- GCP project: `system-design-copilot-140494`
- Region: `us-central1`
- Cluster: `sd-copilot-cluster`
- Namespace: `sd-copilot`
- Service: `sd-copilot-service`
- Deployment: `sd-copilot-deployment`
- Ingress: `sd-copilot-ingress`
- Artifact Registry repo: `sd-copilot`

Refer to `Deployment.md` for the full architecture and one-time setup.
This file is focused on **daily workflow**.

---

## 0. Quick environment setup (run in every new terminal)

From the project root:

```bash
cd /Users/your-user/Documents/AI\ Projects/Project1

export PROJECT_ID=system-design-copilot-140494
export REGION=us-central1
export CLUSTER_NAME=sd-copilot-cluster
export REPO=sd-copilot
export IMAGE_NAME=system-design-copilot

# Pick a tag for this deploy (v2, v3, etc.)
export TAG=v2

export FULL_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME:$TAG"
export DOCKER_DEFAULT_PLATFORM=linux/amd64

# Make sure gcloud is pointed at the right project/region:
gcloud config set project "$PROJECT_ID"
gcloud config set compute/region "$REGION"

# Make sure kubectl context is set to the GKE cluster (if needed):
gcloud container clusters get-credentials "$CLUSTER_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID"

kubectl config current-context
```

---

## 1. Redeploy after code changes

Use this flow whenever you change backend code and want to deploy a new version.

### 1.1 Build and push Docker image

From the project root:

```bash
# 1) Build local image for linux/amd64 (GKE node architecture)
docker build -t sd-copilot:local .

# 2) Tag with Artifact Registry path
docker tag sd-copilot:local "$FULL_IMAGE"

# 3) Push to Artifact Registry
docker push "$FULL_IMAGE"
```

You can optionally verify the image and tag:

```bash
gcloud artifacts docker images list \
  "$REGION-docker.pkg.dev/$PROJECT_ID/$REPO" \
  --include-tags \
  --format='table(IMAGE, TAGS)'
```

You should see your tag (e.g. `v2`) on `system-design-copilot`.

---

### 1.2 (Optional) Update Kubernetes Secrets if env changed

If you changed any environment variables (DB URL, Redis URL, API keys, etc.):

1. Update `k8s/secrets.env` locally.
2. Recreate the secret in the cluster:

```bash
kubectl delete secret sd-copilot-secrets -n sd-copilot 2>/dev/null || true

kubectl create secret generic sd-copilot-secrets \
  -n sd-copilot \
  --from-env-file=k8s/secrets.env
```

Pods read their env variables at startup; recreating the secret + restarting is enough.

---

### 1.3 Apply manifests (only needed if resources don’t exist yet)

If the namespace, service, or ingress were deleted or this is a new cluster:

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

If they already exist, this is safe (it will reconcile changes).

---

### 1.4 Point Deployment to the new image

Update the running deployment to use the new image tag:

```bash
kubectl set image deployment/sd-copilot-deployment \
  sd-copilot="$FULL_IMAGE" \
  -n sd-copilot
```

Watch rollout:

```bash
kubectl rollout status deployment/sd-copilot-deployment -n sd-copilot
kubectl get pods -n sd-copilot
```

You should see pods in `Running` and `READY 1/1`.

---

### 1.5 Verify app via Service and Ingress

#### A. Internal check (Service via port-forward)

```bash
kubectl port-forward svc/sd-copilot-service -n sd-copilot 8080:80
```

Then in another terminal:

```bash
curl "http://localhost:8080/api/v1/health/live"
curl "http://localhost:8080/api/v1/health/ready"
```

Stop port-forward with `Ctrl + C`.

#### B. External check (public Ingress IP)

Get Ingress IP:

```bash
INGRESS_IP=$(kubectl get ingress sd-copilot-ingress -n sd-copilot \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

echo "$INGRESS_IP"
```

Check health and UI:

```bash
curl "http://$INGRESS_IP/api/v1/health/live"
curl "http://$INGRESS_IP/api/v1/health/ready"
curl "http://$INGRESS_IP/"
```

If all respond with `200` (and UI loads in browser at `http://<INGRESS_IP>/`), redeploy is complete.

---

## 2. Fast dev loop (minimal steps when only backend code changes)

For typical small code changes (no env changes, no infra changes):

```bash
# 0) From project root, env already exported (PROJECT_ID, REGION, TAG, FULL_IMAGE, etc.)

# 1) Build & push
docker build -t sd-copilot:local .
docker tag sd-copilot:local "$FULL_IMAGE"
docker push "$FULL_IMAGE"

# 2) Point deployment to new image
kubectl set image deployment/sd-copilot-deployment \
  sd-copilot="$FULL_IMAGE" \
  -n sd-copilot

# 3) Wait and verify
kubectl rollout status deployment/sd-copilot-deployment -n sd-copilot
kubectl get pods -n sd-copilot

INGRESS_IP=$(kubectl get ingress sd-copilot-ingress -n sd-copilot \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

curl "http://$INGRESS_IP/api/v1/health/ready"
```

This is the **everyday** deploy path.

---

## 3. Cost control – pause or shut down when not needed

To avoid unnecessary charges when you’re not actively using the app, you can scale down in layers.

### 3.1 Cheap pause: stop app pods, keep cluster and LB

This stops your app from running but keeps the cluster + load balancer:

```bash
# Scale app deployment to 0 replicas
kubectl scale deployment sd-copilot-deployment \
  -n sd-copilot \
  --replicas=0

kubectl get pods -n sd-copilot
```

- Pros:
  - No app containers running.
  - Secrets, Service, Ingress, and cluster remain intact.
  - Easy to resume: just scale replicas back up.
- Cons:
  - You **still pay** for the external HTTP load balancer and the GKE control plane.

To resume:

```bash
kubectl scale deployment sd-copilot-deployment \
  -n sd-copilot \
  --replicas=1

kubectl rollout status deployment/sd-copilot-deployment -n sd-copilot
```

---

### 3.2 Stop public exposure: delete Ingress (removes LB cost)

This removes the external load balancer but keeps the cluster and resources:

```bash
kubectl delete ingress sd-copilot-ingress -n sd-copilot
```

- Pros:
  - External HTTP(S) Load Balancer and its IP are deleted → you stop paying for LB hours.
  - Deployment, Service, and cluster remain.
- Cons:
  - No public IP until you recreate the Ingress.

To recreate later:

```bash
kubectl apply -f k8s/ingress.yaml

INGRESS_IP=$(kubectl get ingress sd-copilot-ingress -n sd-copilot \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

echo "$INGRESS_IP"
```

Then app is reachable again at `http://<INGRESS_IP>/`.

You can combine 3.1 and 3.2 if you want **no app pods + no LB** but keep the cluster:

```bash
kubectl scale deployment sd-copilot-deployment -n sd-copilot --replicas=0
kubectl delete ingress sd-copilot-ingress -n sd-copilot
```

---

### 3.3 Full shutdown: delete cluster (max savings)

When you don’t plan to use the environment for a while:

```bash
gcloud container clusters delete "$CLUSTER_NAME" \
  --region="$REGION"
```

- Pros:
  - GKE cluster, control plane, and related compute are removed.
  - External LB tied to the cluster is also cleaned up.
- Cons:
  - You’ll need to recreate the cluster and re-apply manifests later.
  - Pods, Services, and Ingress definitions in the cluster are gone (but your **code, manifests, and images remain** in git and Artifact Registry).

To recreate later:

1. Recreate the cluster (same as in `Deployment.md`):

   ```bash
   gcloud container clusters create-auto "$CLUSTER_NAME" \
     --region "$REGION"

   gcloud container clusters get-credentials "$CLUSTER_NAME" \
     --region "$REGION" \
     --project "$PROJECT_ID"
   ```

2. Re-apply manifests and redeploy:

   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/service.yaml
   kubectl apply -f k8s/ingress.yaml

   # Recreate secrets
   kubectl create secret generic sd-copilot-secrets \
     -n sd-copilot \
     --from-env-file=k8s/secrets.env

   # Point deployment at an existing image tag (e.g., v2)
   export TAG=v2
   export FULL_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/$IMAGE_NAME:$TAG"

   kubectl set image deployment/sd-copilot-deployment \
     sd-copilot="$FULL_IMAGE" \
     -n sd-copilot

   kubectl rollout status deployment/sd-copilot-deployment -n sd-copilot
   ```

3. Get the new Ingress IP and verify:

   ```bash
   INGRESS_IP=$(kubectl get ingress sd-copilot-ingress -n sd-copilot \
     -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

   echo "$INGRESS_IP"

   curl "http://$INGRESS_IP/api/v1/health/ready"
   ```

---

## 4. Practical recommendations

For your current usage:

- **Day-to-day while actively working**:
  - Keep cluster + Ingress.
  - Use the **fast dev loop** in section 2.
- **When you’re done for the week / not demoing**:
  - At minimum:
    ```bash
    kubectl scale deployment sd-copilot-deployment -n sd-copilot --replicas=0
    ```
  - If you’re OK recreating public IP later: also
    ```bash
    kubectl delete ingress sd-copilot-ingress -n sd-copilot
    ```
- **If you’re going on a long break (weeks/months)**:
  - Delete the cluster (3.3) and rely on `Deployment.md` + this `Startup.md` to recreate it when needed.

This keeps your environment **reproducible** and your **costs under control**, while preserving a strong story for interviews.