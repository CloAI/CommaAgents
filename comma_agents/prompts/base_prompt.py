from typing import Optional, TypedDict


"""
prompt = Prompt(
    format="
<|im_start|>system
{system_message}<|im_end|>
<|im_start|>user
{prompt}<|im_end|>
<|im_start|>assistant
{assistant_message}<|im_end|>
"
)
"""

class Prompt():
    class PromptConfig(TypedDict, total=True):
        system_prompt: str

    class PromptFormatStructure(TypedDict, total=False):
        system_message_start_token: Optional[str]
        system_message_end_token: Optional[str]
        user_message_start_token: Optional[str]
        user_message_end_token: Optional[str]
        assistant_message_start_token: Optional[str]
        assistant_message_end_token: Optional[str]

    def __init__(
            self,
            format: Optional[str] = None,
            remember_context: bool = False,
            context_window_size: Optional[int] = None,
            prompt_format_structure: Optional[PromptFormatStructure] = None,
            custom_params: Optional[dict] = None,
            **kwargs
    ):
        if format is not None and prompt_format_structure is not None:
            raise ValueError("Cannot specify both format and prompt_format_structure.")
        
        if format is None and prompt_format_structure is None:
            raise ValueError("Must specify either format or prompt_format_structure.")

        if format is not None:
            self.format = format
            self.prompt_format_structure = self.parse_format()
        else:
            self.prompt_format_structure = prompt_format_structure
            self.format = self.build_string(prompt_format_structure)
        
        self.historical_context = []
    
    def parse_format(self):
        # Dictionary to hold the parsed format structure
        structure = {}

        # Define the tokens to look for
        tokens = ['system_message', 'user_message', 'assistant_message']

        # Iterate over the tokens and parse the format string
        for token in tokens:
            start_token = f"{token}_start_token"
            end_token = f"{token}_end_token"
            if token in self.format:
                # Find the start and end indices for each token
                start_idx = self.format.index(token)
                end_idx = self.format.index(token) + len(token)
                # Extract the strings before and after the token
                structure[start_token] = self.format[:start_idx]
                structure[end_token] = self.format[end_idx:]

        return structure


    def append_history(self, prompt: str, response: str):
        self.historical_context.append({
            "prompt": prompt,
            "response": response,
        })

    def build_prompt(self):
        NotImplementedError