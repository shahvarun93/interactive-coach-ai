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