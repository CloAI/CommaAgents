from comma_agents.hub.agents.cloai.openai import OpenAIAPIAgent
from comma_agents.prompts import PromptTemplate
import os
import ast

TEST_GENERATOR_SYSTEM_PROMPT = """
You are a powerful python pytest creator.
You will output Python pytest code to test a series of classes.
You will be given the classes and their methods in full.
You will generate tests for each method in the class.
The code you are given is the only code.
Do not ask for anymore details, just generate tests to the best of your ability.
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
                tree = ast.parse(file_contents)
                methods = extract_class_methods(tree)
                init_method = methods.pop(0)
                i = 0
                for method in methods:
                    i += 1
                    prompt = """
Given the following class named: {class_name}
                    
__init__ method:
```python
{init_method}
```

Write a pytest test for the following method:
                    
```python
{method}
```
""".format(method=method, init_method=init_method, class_name=os.path.basename(file).replace(".py", ""))
                    response = openai_agent.call(prompt)

                    # Write the response to a file
                    output_file = f"./.temp/test_3_{i}_{os.path.basename(file)}"
                    with open(output_file, "w") as f2:
                        f2.write(response)
                    
process_files("./comma_agents/agents")