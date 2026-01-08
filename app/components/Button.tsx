import { forwardRef, ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "ghost" | "accent";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

interface ButtonAsButton extends ButtonBaseProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> {
  href?: never;
}

interface ButtonAsLink extends ButtonBaseProps {
  href: string;
}

type ButtonProps = ButtonAsButton | ButtonAsLink;

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-gradient-to-r from-primary to-accent text-white font-semibold hover:opacity-90 shadow-md hover:shadow-lg",
  secondary: "bg-card-bg border border-border text-foreground font-medium hover:bg-border/50",
  ghost: "text-foreground/70 hover:text-foreground hover:bg-card-bg",
  accent: "bg-gradient-to-r from-[#a3e635] to-[#bef264] text-black font-semibold shadow-md hover:shadow-lg hover:brightness-105",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm rounded-lg",
  md: "px-6 py-2.5 text-sm rounded-xl",
  lg: "px-6 py-3 text-base rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", fullWidth = false, children, leftIcon, rightIcon, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5";
    const className = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${fullWidth ? "w-full" : ""}`;

    if ("href" in props && props.href) {
      return (
        <Link href={props.href} className={className}>
          {leftIcon}
          {children}
          {rightIcon}
        </Link>
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { href: _href, ...buttonProps } = props as ButtonAsButton;

    return (
      <button ref={ref} className={className} {...buttonProps}>
        {leftIcon}
        {children}
        {rightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
