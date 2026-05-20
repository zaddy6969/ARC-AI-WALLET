export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/#bridge",
      permanent: false
    }
  };
}

export default function BridgeRedirect() {
  return null;
}
