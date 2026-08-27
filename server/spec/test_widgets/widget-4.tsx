type Props = {output: string; error?: string};

export const command = "echo tsx";
export const refreshFrequency: number | false = false;
export const render = ({output}: Props) => {
  return <div className="tsx-widget">{output}</div>;
};
