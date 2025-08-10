from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import io
from transformers import ViTFeatureExtractor, ViTForImageClassification
import torch

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React's default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the model and feature extractor
print("Loading model...")
feature_extractor = ViTFeatureExtractor.from_pretrained('wambugu71/crop_leaf_diseases_vit')
model = ViTForImageClassification.from_pretrained(
    'wambugu1738/crop_leaf_diseases_vit',
    ignore_mismatched_sizes=True
)
print("Model loaded successfully!")

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    # Check if the file is an image
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File provided is not an image")
    
    try:
        # Read the image file
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        
        # Process the image and make prediction
        inputs = feature_extractor(images=image, return_tensors="pt")
        with torch.no_grad():
            outputs = model(**inputs)
        
        # Get the predicted class
        predicted_class_idx = outputs.logits.argmax(-1).item()
        predicted_class = model.config.id2label[predicted_class_idx]
        
        return {"prediction": predicted_class}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"message": "Crop Disease Detection API is running!"}
