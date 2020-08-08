FROM node

RUN mkdir /app

WORKDIR /app

COPY ./ ./

RUN npm install




EXPOSE 3001

CMD node ./src/index.js
