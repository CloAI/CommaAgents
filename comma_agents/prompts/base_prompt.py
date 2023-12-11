# TODO: Gonna create a better prompt template system to pass things around to other agents and flows

class PromptTemplate():
    def __init__(self, prompt, **kwargs):
        self.prompt = prompt
        
    def build_prompt(self):
        NotImplementedError