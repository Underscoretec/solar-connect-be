import figlet from "figlet";

export default function createArtUsingServerName(serverName: string) {
  figlet(serverName, (err: any, data: any) => {
    if (err) {
      console.log("Something went wrong...");
      console.dir(err);
      return;
    }
    console.log(data);
  });
}

