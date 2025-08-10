# Crop Disease Detection Backend

This is a FastAPI backend that provides an API for crop disease detection using a pre-trained Vision Transformer (ViT) model.

## Setup

1. Create a Python virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```

2. Install the required packages:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Backend

1. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```

2. The API will be available at `http://localhost:8000`

## API Endpoints

- `GET /`: Health check endpoint
- `POST /predict`: Accepts an image file and returns the predicted crop disease

## Testing the API

You can test the API using curl or any API testing tool:

```bash
curl -X POST -F "file=@path_to_your_image.jpg" http://localhost:8000/predict
```
