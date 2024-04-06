import os
import sys
import click
import comma_agents
from comma_agents.strategies.strategy import Strategy

HUB_REPO_LINK = "https://github.com/CloAI/CommaAgentsHub.git"
base_path = os.path.join(comma_agents.__path__[0]) 
sys.meta_path.insert(0, comma_agents.CommaAgentsHubSparseCheckoutFinder(comma_agents.CommaAgentsHubSparseCheckoutLoader(base_path, HUB_REPO_LINK)))


@click.group()
def cli():
    """Comma Agents CLI"""
    pass

@click.group()
def strategy():
    """Strategy related commands"""
    pass

@strategy.command()
@click.option('--file', type=click.Path(exists=True), help='Path to the strategy YAML file', required=True)
def run(file):
    """Run a strategy from a YAML file."""
    strategy = Strategy(strategy_name="Loaded Strategy")
    strategy.load_from_file(file)
    # Assuming your Strategy class or a superclass has a method to execute the strategy
    strategy.run_flow()
    click.echo("Strategy executed successfully.")

# Add the strategy group as a subcommand to the main CLI group
cli.add_command(strategy)