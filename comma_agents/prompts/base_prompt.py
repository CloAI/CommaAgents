

class BasePrompt():
    def __init__(self, prompt, **kwargs):
        self.prompt = prompt
        
    def build_prompt(self):
        NotImplementedError