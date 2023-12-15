from comma_agents.flows import SequentialFlow
from comma_agents.agents.external import LLaMaAgent
from comma_agents.agents import BaseAgent

DEEPSEEK_CODER_TEST_GENERATOR_PROMPT = """
You are a powerful python test creator.
You will output Python pytest code to test a series of classes.
You will be given the classes and their methods in full
You will generate tests for each method in the class.
"""
# {system_prompt}
# ### Instruction:
# {prompt}
# ### Response:

deepseek_prompt_format: BaseAgent.AgentPromptFormats = {
    "system_message_start_token": "",
    "system_message_end_token": "\n",
    "user_message_start_token": "### Instruction:\n",
    "user_message_end_token": "\n",
    "assistant_message_start_token": "### Response:\n",
    "assistant_message_end_token": "\n"
}

deepseek_llm = LLaMaAgent(
    name="deepseek_llm",
    system_prompt=DEEPSEEK_CODER_TEST_GENERATOR_PROMPT,
    llama_config={
        "model_path": "/Users/nateageek/.cache/lm-studio/models/TheBloke/deepseek-coder-6.7B-instruct-GGUF/deepseek-coder-6.7b-instruct.Q6_K.gguf",
        "n_ctx": 512 * 16,
    },
    prompt_formats=deepseek_prompt_format,
)


import os

def list_all_files(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            yield os.path.join(root, file)

for file in list_all_files("./comma_agents/agents"):
    if file.endswith(".py") and "__init__" not in file and "external" not in file:
        print(file)
        with open(file, "r") as f:
            file_contents = f.read()
            response = deepseek_llm.call(file_contents)
            # Write the response to a ./.temp/test_{file}.py
            with open(f"./.temp/test_{file.split('/')[-1]}", "w") as f2:
                f2.write(response)
