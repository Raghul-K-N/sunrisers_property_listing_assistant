import ollama
import requests
import time
import base64

# --- CONFIGURATION ---
MODEL_NAME = "qwen3-vl:4b"
IMAGE_PATH = "/home/whirldata/Downloads/PaddleOCR/Samples/Japanese.jpg"  # <--- REPLACE THIS with your actual image path
PROMPT = "Describe this image in detail and extract any text visible."
DEFAULT_OLLAMA_API_URL = "http://localhost:11434/api/generate"

# LLM parameters for consistent output
DEFAULT_TEMPERATURE = 0  # Low temperature for more deterministic outputs
DEFAULT_MAX_TOKENS = 2048  # Sufficient tokens for response
DEFAULT_TOP_P = 0.9  # Nucleus sampling parameter
DEFAULT_RETRY_COUNT = 2  # Number of retries if extraction fails

def encode_image_to_base64(path):
    try:
        with open(path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')
    except FileNotFoundError:
        print(f"Error: Could not find image at {path}")
        return None

def query_ollama(prompt, model=MODEL_NAME, api_url=DEFAULT_OLLAMA_API_URL, 
                   temperature : int | float =DEFAULT_TEMPERATURE, max_tokens=DEFAULT_MAX_TOKENS, top_p=DEFAULT_TOP_P):
    """
    Send a prompt to the local Ollama API and get the response with controlled parameters
    for more consistent outputs
    
    Args:
        prompt (str): The prompt to send to the LLM
        model (str): The Ollama model to use
        api_url (str): The Ollama API URL
        temperature (float): Controls randomness (lower = more deterministic)
        max_tokens (int): Maximum number of tokens to generate
        top_p (float): Nucleus sampling parameter
        
    Returns:
        str: The LLM's response
    """
    print(f"Querying Ollama LLM using model: {model} with temperature: {temperature}...")
    
    image_b64 = encode_image_to_base64(IMAGE_PATH)
    if not image_b64: return
    # Prepare the request payload with additional parameters for consistency
    payload = {
        "model": model,
        "prompt": prompt,
        "images":[image_b64],
        "stream": False
    }
    
    try:
        start_time = time.perf_counter()
        try:
            # Send the request to Ollama
            response = requests.post(api_url, json=payload)
            response.raise_for_status()  # Raise exception for HTTP errors

            # Parse the response
            result = response.json()
            return result.get("response", "")
        finally:
            elapsed = time.perf_counter() - start_time
            print(f"Ollama query took {elapsed:.3f} seconds")
    
    except requests.exceptions.RequestException as e:
        print(f"Error querying Ollama: {e}", "error")
        print("Make sure Ollama is running locally with the command: ollama serve", "warning")


    except ollama.ResponseError as e:
        print(f"Ollama Error: {e.error}")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    result = query_ollama(prompt=PROMPT)
    print(result)