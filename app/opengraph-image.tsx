import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Suplatzigram - Curso de Supabase de Platzi";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "white",
            borderRadius: "24px",
            padding: "60px 80px",
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <svg
              width="80"
              height="80"
              viewBox="0 0 24 24"
              fill="none"
              style={{ marginRight: "20px" }}
            >
              <rect
                x="2"
                y="2"
                width="20"
                height="20"
                rx="5"
                stroke="#667eea"
                strokeWidth="2"
              />
              <circle
                cx="12"
                cy="12"
                r="4"
                stroke="#764ba2"
                strokeWidth="2"
              />
              <circle cx="18" cy="6" r="1.5" fill="#667eea" />
            </svg>
            <h1
              style={{
                fontSize: "64px",
                fontWeight: "bold",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                backgroundClip: "text",
                color: "transparent",
                margin: 0,
              }}
            >
              Suplatzigram
            </h1>
          </div>
          <p
            style={{
              fontSize: "28px",
              color: "#4b5563",
              margin: 0,
              textAlign: "center",
            }}
          >
            App inspirada en Instagram
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: "30px",
              gap: "12px",
            }}
          >
            <div
              style={{
                backgroundColor: "#3ECF8E",
                padding: "8px 20px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <span style={{ color: "white", fontSize: "20px", fontWeight: 600 }}>
                Supabase
              </span>
            </div>
            <span style={{ fontSize: "24px", color: "#9ca3af" }}>+</span>
            <div
              style={{
                backgroundColor: "#000",
                padding: "8px 20px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <span style={{ color: "white", fontSize: "20px", fontWeight: 600 }}>
                Next.js
              </span>
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: "40px",
          }}
        >
          <p
            style={{
              fontSize: "24px",
              color: "white",
              margin: 0,
              opacity: 0.9,
            }}
          >
            Curso de Supabase de Platzi
          </p>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
