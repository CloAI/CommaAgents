from comma_agents.flows import SequentialFlow
from comma_agents.agents.external import LLaMaAgent, OpenAIAPIAgent, BardAgent
from comma_agents.prompts import DeepSeekPromptTemplate, PromptTemplate
from comma_agents.code_interpreters import CodeInterpreter
import os

TEST_GENERATOR_SYSTEM_PROMPT = """
You are a powerful python pytest creator.
You will output Python pytest code to test a series of classes.
You will be given the classes and their methods in full.
You will generate tests for each method in the class.
The code you are given is the only code.
Do not ask for anymore details, just generate tests to the best of your ability.
"""

bard_agent = BardAgent("Bard Agent",
    prompt_template=PromptTemplate(
        format="{user_message}",
        parameters={
            "system_message": "",
        }
    ),
)

bard_agent.call(TEST_GENERATOR_SYSTEM_PROMPT)

def list_all_files(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            yield os.path.join(root, file)

for file in list_all_files("./comma_agents/agents"):
    if file.endswith(".py") and "__init__" not in file and "external" not in file:
        with open(file, "r") as f:
            file_contents = f.read()
            response = bard_agent.call(file_contents)
            # Write the response to a ./.temp/test_{file}.py
            with open(f"./.temp/test_{file.split('/')[-1]}", "w") as f2:
                f2.write(response)
