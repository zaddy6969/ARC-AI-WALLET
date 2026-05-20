export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/#portfolio",
      permanent: false
    }
  };
}

export default function PortfolioRedirect() {
  return null;
}
