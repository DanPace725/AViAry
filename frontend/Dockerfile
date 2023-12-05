# Step 1: Use an official Node runtime as a parent image
FROM node:latest

# Step 2: Set the working directory
WORKDIR /app

# Step 3: Copy package.json and install dependencies
COPY package.json ./
COPY package-lock.json ./
RUN npm install

# Step 4: Copy the rest of your app's source code
COPY . ./

# Step 5: Expose port and run the application
EXPOSE 3000
CMD ["npm", "start"]
