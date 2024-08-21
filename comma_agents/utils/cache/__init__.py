import os
import platformdirs
import base64
import hashlib

# TODO: Figure out a good caching schema to include the models properties that might change...


def check_cache_for_response(prompt, model_params):
    """
    Check if the response is in the cache
    """
    cache_key_str = prompt
    cache_key = hashlib.md5(cache_key_str.encode()).hexdigest()
    cache_dir = platformdirs.user_cache_dir("comma_agents")
    cache_file = os.path.join(cache_dir, f"{cache_key}.txt")

    if os.path.exists(cache_file):
        with open(cache_file, "r") as f:
            return f.read()
    return None

def save_response_to_cache(prompt, model_params, response):
    """
    Save response to cache
    TODO: Support model params to allow for more better updates...
    """
    cache_key_str = prompt
    cache_key = hashlib.md5(cache_key_str.encode()).hexdigest()
    cache_dir = platformdirs.user_cache_dir("comma_agents")
    cache_file = os.path.join(cache_dir, f"{cache_key}.txt")

    os.makedirs(cache_dir, exist_ok=True)
    with open(cache_file, "w") as f:
        f.write(response)
        
    return True