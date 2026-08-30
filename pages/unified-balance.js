export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/#unified",
      permanent: false
    }
  };
}

export default function UnifiedBalanceRedirect() {
  return null;
}
