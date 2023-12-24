from comma_agents.flows import SequentialFlow
from comma_agents.agents.external import LLaMaAgent, OpenAIAPIAgent, BardAgent
from comma_agents.prompts import DeepSeekPromptTemplate, PromptTemplate
from comma_agents.code_interpreters import CodeInterpreter
import os
import ast

TEST_GENERATOR_SYSTEM_PROMPT = """
Write a markdown document for following class.
Make it technical documentation and include emojis.
Make it focused on the high level concepts of the class.
If possible provide an code example.
Do NOT provide sample use cases.
Do NOT make analogies or use metaphors.
"""

openai_agent = OpenAIAPIAgent(name="OpenAI API Agent", config={
    "model_name": "gpt-4-1106-preview"
}, prompt_template=PromptTemplate(
    parameters={
        "system_message": TEST_GENERATOR_SYSTEM_PROMPT
    }
))

def list_all_files(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            yield os.path.join(root, file)

def is_class_method(node):
    return isinstance(node, ast.FunctionDef)

def extract_class_methods(tree): 
    class_methods = []

    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            for item in node.body:
                if is_class_method(item):
                    method_source = ast.unparse(item)
                    class_methods.append(method_source)
    
    return class_methods

def process_files(directory):
    for file in list_all_files(directory):
        if file.endswith(".py") and "__init__" not in file and "external" not in file:
            with open(file, "r") as f:
                file_contents = f.read()
                response = openai_agent.call(file_contents)

                # Write the response to a file
                output_file = f"./.temp/docs/markdown_{os.path.basename(file)}.md"
                with open(output_file, "w") as f2:
                    f2.write(response)
                    
process_files("./comma_agents/flows")