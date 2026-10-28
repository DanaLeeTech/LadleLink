import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";

interface Props {
  children: ReactNode;
  /** Remove the broken recipe, then leave the page. */
  onDelete?: () => Promise<void>;
}

interface State {
  failed: boolean;
  deleting: boolean;
  error: string | null;
}

/**
 * Last line of defence for a recipe page: a recipe with damaged fields throws while
 * rendering, so name the problem and offer Delete instead of showing a blank page.
 */
export class RecipeErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, deleting: false, error: null };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  private onDelete = async () => {
    this.setState({ deleting: true, error: null });
    try {
      await this.props.onDelete?.();
    } catch (err) {
      this.setState({
        deleting: false,
        error: err instanceof Error ? err.message : "Delete failed",
      });
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="panel">
        <p className="error">This recipe couldn't be loaded.</p>
        <p className="lede">Its saved data is incomplete or damaged. Delete it to clear the entry.</p>
        {this.state.error && <p className="error">{this.state.error}</p>}
        <div className="toolbar">
          <button
            className="btn danger"
            type="button"
            disabled={this.state.deleting}
            onClick={() => void this.onDelete()}
          >
            {this.state.deleting ? "Deleting…" : "Delete recipe"}
          </button>
          <Link className="btn secondary" to="/">
            Back to recipes
          </Link>
        </div>
      </main>
    );
  }
}
