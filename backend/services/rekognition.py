"""
AWS Rekognition service — IndexFaces (registration) + SearchFacesByImage (scan)
"""
import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException
from config import get_settings

settings = get_settings()

def _rekognition():
    return boto3.client(
        "rekognition",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
    )

def _s3():
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
    )


def ensure_collection_exists() -> None:
    """Create the Rekognition face collection if it doesn't exist yet."""
    import logging
    rek = _rekognition()
    try:
        rek.create_collection(CollectionId=settings.aws_rekognition_collection)
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceAlreadyExistsException":
            raise
    except Exception as e:
        logging.warning(f"Could not verify Rekognition collection at startup: {e}")


def upload_photo_to_s3(image_bytes: bytes, s3_key: str) -> str:
    """Upload a photo to S3. Returns the S3 key."""
    _s3().put_object(
        Bucket=settings.aws_s3_bucket,
        Key=s3_key,
        Body=image_bytes,
        ContentType="image/jpeg",
        ServerSideEncryption="AES256",
    )
    return s3_key


def index_face(image_bytes: bytes, student_id: str) -> str | None:
    """
    Register one photo into the Rekognition collection.
    Returns the FaceId string, or None if no face was detected.
    """
    rek = _rekognition()
    response = rek.index_faces(
        CollectionId=settings.aws_rekognition_collection,
        Image={"Bytes": image_bytes},
        ExternalImageId=student_id,          # links FaceId → our student UUID
        DetectionAttributes=["DEFAULT"],
        MaxFaces=1,                           # only one face per registration photo
        QualityFilter="MEDIUM",              # reject blurry / occluded faces
    )
    faces = response.get("FaceRecords", [])
    if not faces:
        return None
    return faces[0]["Face"]["FaceId"]


def search_face(image_bytes: bytes, threshold: float = 80.0) -> dict | None:
    """
    Search the collection for a matching face.
    Returns dict with FaceId + similarity, or None if no match above threshold.
    
    threshold: minimum similarity % to count as a match (80 = strict, 70 = lenient)
    """
    rek = _rekognition()
    try:
        response = rek.search_faces_by_image(
            CollectionId=settings.aws_rekognition_collection,
            Image={"Bytes": image_bytes},
            MaxFaces=1,                       # only want the best match
            FaceMatchThreshold=threshold,
        )
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code == "InvalidParameterException":
            # Rekognition couldn't detect a face in the image
            return None
        raise HTTPException(status_code=502, detail=f"AWS error: {code}")

    matches = response.get("FaceMatches", [])
    if not matches:
        return None

    best = matches[0]
    return {
        "face_id": best["Face"]["FaceId"],
        "similarity": round(best["Similarity"], 2),
        "external_image_id": best["Face"].get("ExternalImageId"),
    }


def delete_face(face_id: str) -> None:
    """Remove a face from the collection (e.g. when deleting a student)."""
    _rekognition().delete_faces(
        CollectionId=settings.aws_rekognition_collection,
        FaceIds=[face_id],
    )
