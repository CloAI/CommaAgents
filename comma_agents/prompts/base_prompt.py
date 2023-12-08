

class PromptTemplate():
    def __init__(self, prompt, **kwargs):
        self.prompt = prompt
        
    def build_prompt(self):
        NotImplementedError