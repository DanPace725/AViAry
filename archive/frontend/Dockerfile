# Step 1: Use an official Node runtime as a parent image
FROM node:latest

# Create app directory
RUN mkdir -p /app/aviary

# Step 2: Set the working directory
WORKDIR /app/aviary

# Step 3: Copy package.json and install dependencies
COPY aviary/package.json ./
COPY aviary/package-lock.json ./
RUN npm install

# Step 4: Copy the rest of your app's source code
COPY . .

# Step 5: Expose port and run the application
EXPOSE 3000
CMD ["npm", "start"]
