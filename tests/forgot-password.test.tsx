import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ForgotPasswordPage from "../app/auth/forgot-password/page";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the Button component
vi.mock("../app/components/Button", () => ({
  Button: ({ children, disabled, type, onClick, href, leftIcon }: {
    children: React.ReactNode;
    disabled?: boolean;
    type?: string;
    onClick?: () => void;
    href?: string;
    leftIcon?: React.ReactNode;
  }) => {
    if (href) {
      return <a href={href}>{leftIcon}{children}</a>;
    }
    return (
      <button type={type as "submit" | "button"} disabled={disabled} onClick={onClick}>
        {children}
      </button>
    );
  },
}));

// Mock the icons
vi.mock("../app/components/icons", () => ({
  BackIcon: () => <span data-testid="back-icon">←</span>,
}));

// Create mock functions for Supabase auth
const mockResetPasswordForEmail = vi.fn();

// Mock the Supabase client
vi.mock("../app/utils/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
    },
  },
}));

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location.origin
    Object.defineProperty(window, "location", {
      value: { origin: "https://example.com" },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Rendering", () => {
    it("renders the page title and description", () => {
      render(<ForgotPasswordPage />);

      expect(screen.getByText("Suplatzigram")).toBeInTheDocument();
      expect(screen.getByText("Recupera tu contrasena")).toBeInTheDocument();
      expect(screen.getByText(/Ingresa tu correo electronico/)).toBeInTheDocument();
    });

    it("renders the email input field", () => {
      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute("type", "email");
      expect(emailInput).toBeRequired();
    });

    it("renders the submit button", () => {
      render(<ForgotPasswordPage />);

      expect(screen.getByRole("button", { name: "Enviar enlace" })).toBeInTheDocument();
    });

    it("renders the back to login link", () => {
      render(<ForgotPasswordPage />);

      expect(screen.getByText("Recordaste tu contrasena?")).toBeInTheDocument();
      expect(screen.getByText("Inicia sesion")).toHaveAttribute("href", "/auth/login");
    });

    it("renders the back button", () => {
      render(<ForgotPasswordPage />);

      const backLink = screen.getByText("Volver");
      expect(backLink).toHaveAttribute("href", "/auth/login");
    });
  });

  describe("Form Submission - Success", () => {
    it("calls resetPasswordForEmail with correct email and redirectTo", async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });

      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      const submitButton = screen.getByRole("button", { name: "Enviar enlace" });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
          "test@example.com",
          { redirectTo: "https://example.com/auth/callback?next=/auth/reset-password" }
        );
      });
    });

    it("shows success message after successful submission", async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });

      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      const submitButton = screen.getByRole("button", { name: "Enviar enlace" });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Revisa tu correo electronico/)).toBeInTheDocument();
      });
    });

    it("clears the email input after successful submission", async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });

      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      const submitButton = screen.getByRole("button", { name: "Enviar enlace" });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(emailInput).toHaveValue("");
      });
    });
  });

  describe("Form Submission - Error", () => {
    it("shows error message when resetPasswordForEmail fails", async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({
        error: new Error("User not found"),
      });

      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      const submitButton = screen.getByRole("button", { name: "Enviar enlace" });

      fireEvent.change(emailInput, { target: { value: "notfound@example.com" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("User not found")).toBeInTheDocument();
      });
    });

    it("shows generic error message for non-Error exceptions", async () => {
      mockResetPasswordForEmail.mockRejectedValueOnce("Something went wrong");

      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      const submitButton = screen.getByRole("button", { name: "Enviar enlace" });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Error al enviar el correo")).toBeInTheDocument();
      });
    });

    it("does not clear email input on error", async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({
        error: new Error("User not found"),
      });

      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      const submitButton = screen.getByRole("button", { name: "Enviar enlace" });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("User not found")).toBeInTheDocument();
      });

      expect(emailInput).toHaveValue("test@example.com");
    });
  });

  describe("Loading State", () => {
    it("shows loading state while submitting", async () => {
      // Create a promise that we can control
      let resolvePromise: (value: { error: null }) => void;
      const controlledPromise = new Promise<{ error: null }>((resolve) => {
        resolvePromise = resolve;
      });
      mockResetPasswordForEmail.mockReturnValueOnce(controlledPromise);

      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      const submitButton = screen.getByRole("button", { name: "Enviar enlace" });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.click(submitButton);

      // Check loading state
      expect(screen.getByRole("button", { name: "Enviando..." })).toBeDisabled();

      // Resolve the promise
      resolvePromise!({ error: null });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Enviar enlace" })).not.toBeDisabled();
      });
    });

    it("disables submit button during loading", async () => {
      let resolvePromise: (value: { error: null }) => void;
      const controlledPromise = new Promise<{ error: null }>((resolve) => {
        resolvePromise = resolve;
      });
      mockResetPasswordForEmail.mockReturnValueOnce(controlledPromise);

      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      const submitButton = screen.getByRole("button", { name: "Enviar enlace" });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.click(submitButton);

      const loadingButton = screen.getByRole("button", { name: "Enviando..." });
      expect(loadingButton).toBeDisabled();

      resolvePromise!({ error: null });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Enviar enlace" })).toBeInTheDocument();
      });
    });
  });

  describe("Email Validation", () => {
    it("email input has required attribute", () => {
      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      expect(emailInput).toBeRequired();
    });

    it("email input has email type for browser validation", () => {
      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      expect(emailInput).toHaveAttribute("type", "email");
    });
  });

  describe("Redirect URL Configuration", () => {
    it("uses window.location.origin for redirectTo when no env var", async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });

      // Set a specific origin
      Object.defineProperty(window, "location", {
        value: { origin: "https://myapp.vercel.app" },
        writable: true,
      });

      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      const submitButton = screen.getByRole("button", { name: "Enviar enlace" });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
          "test@example.com",
          { redirectTo: "https://myapp.vercel.app/auth/callback?next=/auth/reset-password" }
        );
      });
    });

    it("uses NEXT_PUBLIC_SITE_URL when set", async () => {
      mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });

      // Set the environment variable
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://production.example.com");

      // Set window origin to something different
      Object.defineProperty(window, "location", {
        value: { origin: "http://localhost:3000" },
        writable: true,
      });

      render(<ForgotPasswordPage />);

      const emailInput = screen.getByPlaceholderText("Correo electronico");
      const submitButton = screen.getByRole("button", { name: "Enviar enlace" });

      fireEvent.change(emailInput, { target: { value: "test@example.com" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
          "test@example.com",
          { redirectTo: "https://production.example.com/auth/callback?next=/auth/reset-password" }
        );
      });

      // Clean up
      vi.unstubAllEnvs();
    });
  });
});
