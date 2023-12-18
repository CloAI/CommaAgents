from .base_prompt import PromptTemplate

class ZephyrPromptTemplate(PromptTemplate):
    zephyr_prompt_template_format = """<|system|>
{system_message}</s>
<|user|>
{user_message}</s>
<|assistant|>
{assistant_message}"""
    def __init__(self, **kwargs):
        super().__init__(self.zephyr_prompt_template_format, **kwargs)
        
class LLaMaPromptTemplate(PromptTemplate):
    llama_prompt_template_format = """{system_message}
USER: {user_message}
ASSISTANT: {assistant_message}
"""
    def __init__(self, **kwargs):
        super().__init__(self.llama_prompt_template_format, **kwargs)

class DeepSeekPromptTemplate(PromptTemplate):
    deepseek_prompt_template_format = """
{system_message}
### Instruction:
{user_message}
### Response:
{assistant_message}"""
    def __init__(self, **kwargs):
        super().__init__(self.deepseek_prompt_template_format, **kwargs)
