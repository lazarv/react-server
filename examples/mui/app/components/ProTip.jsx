import LightbulbOutlined from "@mui/icons-material/esm/LightbulbOutlined";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

export default function ProTip() {
  return (
    <Typography sx={{ mt: 6, mb: 3, color: "text.secondary" }}>
      <LightbulbOutlined sx={{ mr: 1, verticalAlign: "middle" }} />
      {"Pro tip: See more "}
      <Link href="https://mui.com/material-ui/getting-started/templates/">
        templates
      </Link>
      {" in the Material UI documentation."}
    </Typography>
  );
}
