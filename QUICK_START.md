# Quick Start Guide

## 1. Install Dependencies

```bash
pip install -r requirements.txt
```

## 2. Start Server

```bash
python -m server.main
```

Server runs at: `http://localhost:8000`

## 3. Run Client Pipeline

```bash
python -m client.run_client_pipeline
```

## 4. Query Analytics

```bash
curl http://localhost:8000/analytics/classroom/CS101
```

## Configuration

- **Client Config**: Edit `client/run_client_pipeline.py`
- **Fusion Config**: Edit `client/fusion/fusion_config.json`
- **Server Storage**: Edit `server/persistence/storage.py`

## Environment Variables

```bash
# Disable network (local-only mode)
ENABLE_NETWORK=false python -m client.run_client_pipeline

# Custom server URL
AFFECT_SERVER_URL=http://your-server:8000 python -m client.run_client_pipeline
```

## Output Locations

- **Client JSONs**: `outputs/client_jsons/`
- **Server Storage**: `outputs/server/`

