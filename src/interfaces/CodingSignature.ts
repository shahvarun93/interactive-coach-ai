export type CodingSignatureParam = {
  name: string;
  type: string;
};

export type CodingSignature = {
  functionName: string;
  params: CodingSignatureParam[];
  returnType: string;
};
