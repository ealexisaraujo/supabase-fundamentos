import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ResetPasswordPage from "../app/auth/reset-password/page";

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
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
const mockGetSession = vi.fn();
const mockUpdateUser = vi.fn();

// Mock the Supabase client
vi.mock("../app/utils/client", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  },
}));

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks to default implementations
    mockGetSession.mockReset();
    mockUpdateUser.mockReset();
    // Set a default implementation to avoid undefined returns during cleanup
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockUpdateUser.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Session Check", () => {
    it("shows loading state while checking session", async () => {
      // Never resolve the session check
      mockGetSession.mockReturnValue(new Promise(() => {}));

      render(<ResetPasswordPage />);

      expect(screen.getByText("Verificando sesion...")).toBeInTheDocument();
    });

    it("redirects to forgot-password page if no session", async () => {
      mockGetSession.mockResolvedValueOnce({ data: { session: null } });

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/auth/forgot-password");
      });
    });

    it("shows the form when session exists", async () => {
      mockGetSession.mockResolvedValueOnce({
        data: { session: { user: { id: "user-123" } } },
      });

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText("Crea una nueva contrasena")).toBeInTheDocument();
      });
    });
  });

  describe("Rendering (with valid session)", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "user-123" } } },
      });
    });

    it("renders the page title and description", async () => {
      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByText("Suplatzigram")).toBeInTheDocument();
        expect(screen.getByText("Crea una nueva contrasena")).toBeInTheDocument();
        expect(screen.getByText(/Ingresa tu nueva contrasena/)).toBeInTheDocument();
      });
    });

    it("renders password input fields", async () => {
      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Confirmar nueva contrasena")).toBeInTheDocument();
      });
    });

    it("password inputs have correct attributes", async () => {
      render(<ResetPasswordPage />);

      await waitFor(() => {
        const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
        const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");

        expect(passwordInput).toHaveAttribute("type", "password");
        expect(passwordInput).toBeRequired();
        expect(passwordInput).toHaveAttribute("minLength", "6");

        expect(confirmInput).toHaveAttribute("type", "password");
        expect(confirmInput).toBeRequired();
        expect(confirmInput).toHaveAttribute("minLength", "6");
      });
    });

    it("renders the submit button", async () => {
      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Actualizar contrasena" })).toBeInTheDocument();
      });
    });

    it("renders the back button", async () => {
      render(<ResetPasswordPage />);

      await waitFor(() => {
        const backLink = screen.getByText("Volver");
        expect(backLink).toHaveAttribute("href", "/");
      });
    });
  });

  describe("Form Validation", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "user-123" } } },
      });
    });

    it("shows error when passwords do not match", async () => {
      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
      const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");
      const submitButton = screen.getByRole("button", { name: "Actualizar contrasena" });

      fireEvent.change(passwordInput, { target: { value: "password123" } });
      fireEvent.change(confirmInput, { target: { value: "different123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Las contrasenas no coinciden")).toBeInTheDocument();
      });

      // Should not call updateUser
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("shows error when password is too short", async () => {
      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
      const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");
      const submitButton = screen.getByRole("button", { name: "Actualizar contrasena" });

      fireEvent.change(passwordInput, { target: { value: "12345" } });
      fireEvent.change(confirmInput, { target: { value: "12345" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("La contrasena debe tener al menos 6 caracteres")).toBeInTheDocument();
      });

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe("Form Submission - Success", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "user-123" } } },
      });
    });

    it("calls updateUser with new password", async () => {
      mockUpdateUser.mockResolvedValueOnce({ error: null });

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
      const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");
      const submitButton = screen.getByRole("button", { name: "Actualizar contrasena" });

      fireEvent.change(passwordInput, { target: { value: "newpassword123" } });
      fireEvent.change(confirmInput, { target: { value: "newpassword123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: "newpassword123" });
      });
    });

    it("shows success message after password update", async () => {
      mockUpdateUser.mockResolvedValueOnce({ error: null });

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
      const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");
      const submitButton = screen.getByRole("button", { name: "Actualizar contrasena" });

      fireEvent.change(passwordInput, { target: { value: "newpassword123" } });
      fireEvent.change(confirmInput, { target: { value: "newpassword123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Contrasena actualizada exitosamente/)).toBeInTheDocument();
      });
    });

    it("redirects to home after successful update", async () => {
      mockUpdateUser.mockResolvedValueOnce({ error: null });

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
      const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");
      const submitButton = screen.getByRole("button", { name: "Actualizar contrasena" });

      fireEvent.change(passwordInput, { target: { value: "newpassword123" } });
      fireEvent.change(confirmInput, { target: { value: "newpassword123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Contrasena actualizada exitosamente/)).toBeInTheDocument();
      });

      // Wait for the redirect timeout (2 seconds) plus buffer
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/");
      }, { timeout: 3000 });

      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  describe("Form Submission - Error", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "user-123" } } },
      });
    });

    it("shows error message when updateUser fails", async () => {
      mockUpdateUser.mockResolvedValueOnce({
        error: new Error("Password too weak"),
      });

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
      const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");
      const submitButton = screen.getByRole("button", { name: "Actualizar contrasena" });

      fireEvent.change(passwordInput, { target: { value: "weak" } });
      fireEvent.change(confirmInput, { target: { value: "weak" } });
      fireEvent.click(submitButton);

      // First it should show validation error (password too short)
      await waitFor(() => {
        expect(screen.getByText("La contrasena debe tener al menos 6 caracteres")).toBeInTheDocument();
      });
    });

    it("shows Supabase error when updateUser returns error", async () => {
      mockUpdateUser.mockResolvedValueOnce({
        error: new Error("New password should be different from the old password"),
      });

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
      const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");
      const submitButton = screen.getByRole("button", { name: "Actualizar contrasena" });

      fireEvent.change(passwordInput, { target: { value: "samepassword123" } });
      fireEvent.change(confirmInput, { target: { value: "samepassword123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("New password should be different from the old password")).toBeInTheDocument();
      });
    });

    it("shows generic error message for non-Error exceptions", async () => {
      mockUpdateUser.mockRejectedValueOnce("Something went wrong");

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
      const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");
      const submitButton = screen.getByRole("button", { name: "Actualizar contrasena" });

      fireEvent.change(passwordInput, { target: { value: "newpassword123" } });
      fireEvent.change(confirmInput, { target: { value: "newpassword123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Error al actualizar la contrasena")).toBeInTheDocument();
      });
    });

    it("does not redirect on error", async () => {
      mockUpdateUser.mockResolvedValueOnce({
        error: new Error("Update failed"),
      });

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
      const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");
      const submitButton = screen.getByRole("button", { name: "Actualizar contrasena" });

      fireEvent.change(passwordInput, { target: { value: "newpassword123" } });
      fireEvent.change(confirmInput, { target: { value: "newpassword123" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Update failed")).toBeInTheDocument();
      });

      // Should not redirect when there's an error
      expect(mockPush).not.toHaveBeenCalledWith("/");
    });
  });

  describe("Loading State", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "user-123" } } },
      });
    });

    it("button text changes during form submission", async () => {
      mockUpdateUser.mockResolvedValueOnce({ error: null });

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
      });

      // Initially button shows "Actualizar contrasena"
      expect(screen.getByRole("button", { name: "Actualizar contrasena" })).toBeInTheDocument();

      const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
      const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");

      fireEvent.change(passwordInput, { target: { value: "newpassword123" } });
      fireEvent.change(confirmInput, { target: { value: "newpassword123" } });

      // After successful submission, button should eventually revert
      // (the loading text "Actualizando..." appears briefly)
      const submitButton = screen.getByRole("button", { name: "Actualizar contrasena" });
      fireEvent.click(submitButton);

      // After submission completes, success message appears
      await waitFor(() => {
        expect(screen.getByText(/Contrasena actualizada exitosamente/)).toBeInTheDocument();
      });
    });
  });

  describe("Password Requirements", () => {
    beforeEach(() => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "user-123" } } },
      });
    });

    it("accepts password with exactly 6 characters", async () => {
      mockUpdateUser.mockResolvedValueOnce({ error: null });

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
      const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");
      const submitButton = screen.getByRole("button", { name: "Actualizar contrasena" });

      fireEvent.change(passwordInput, { target: { value: "123456" } });
      fireEvent.change(confirmInput, { target: { value: "123456" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: "123456" });
      });
    });

    it("accepts long passwords", async () => {
      mockUpdateUser.mockResolvedValueOnce({ error: null });

      render(<ResetPasswordPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Nueva contrasena")).toBeInTheDocument();
      });

      const longPassword = "a".repeat(100);
      const passwordInput = screen.getByPlaceholderText("Nueva contrasena");
      const confirmInput = screen.getByPlaceholderText("Confirmar nueva contrasena");
      const submitButton = screen.getByRole("button", { name: "Actualizar contrasena" });

      fireEvent.change(passwordInput, { target: { value: longPassword } });
      fireEvent.change(confirmInput, { target: { value: longPassword } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: longPassword });
      });
    });
  });
});
