import { Component } from "react";
import WalletLoginScreen from "./wallet-login-screen";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[arc-wallet-app]", error);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <WalletLoginScreen
          providerUnavailable
          providerError="The wallet UI recovered from an unexpected issue. Refresh and connect again when ready."
        />
      );
    }

    return this.props.children;
  }
}
