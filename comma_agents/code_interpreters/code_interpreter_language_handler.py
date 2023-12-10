import os
import subprocess
import tempfile
import uuid

class CodeInterpreterLanguageHandler:
    def __init__(
            self,
            language,
            interpreter_path=None,
            interpreter_args=[],
            use_docker=False,
            generated_files_directory=None,
            delete_generated_files=True,
            docker_image=None,
        ):
        self.language = language
        self.interpreter_path = interpreter_path
        self.interpreter_args = interpreter_args
        self.generated_files_directory = generated_files_directory
        self.delete_generated_files = delete_generated_files

        # TODO: add in docker support
        self.use_docker = use_docker
        self.docker_image = docker_image

    def setup_docker_container(self):
        """Sets up the docker container for the language handler.
        
        :return: The docker container.
        """
        NotImplementedError("Docker support not implemented yet...")

    def detect_language(self, code_block="", inferred_language=""):
        """Detects the language of a code block.
        
        :param code_block: The code block to detect the language of.
        :return: The language of the code block.
        """
        return inferred_language
    
    def execute_code_block(self, code_block: str):
            """Executes a Python code block safely."""
            try:
                # Determine file path: use generated_file_directory or a temporary file
                if self.generated_files_directory and os.path.isdir(self.generated_files_directory):
                    file_path = os.path.join(self.generated_files_directory, f"code_{uuid.uuid4().hex}.py")
                    with open(file_path, 'w') as file:
                        file.write(code_block)
                else:
                    temp_file = tempfile.NamedTemporaryFile(suffix='.py', mode='w+', delete=False)
                    temp_file.write(code_block)
                    file_path = temp_file.name
                    temp_file.close()

                # Execute the Python code in a subprocess
                result = subprocess.run([self.interpreter_path, file_path], capture_output=True, text=True, timeout=30)

                # Handle output and errors
                if result.returncode == 0:
                    return result.stdout
                else:
                    return f"Error: {result.stderr}"
            except Exception as e:
                return f"Execution error: {e}"
            finally:
                # Clean up the file if required
                if self.delete_generated_files:
                    os.remove(file_path)